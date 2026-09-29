package live;

import com.exchange.domain.BookSnapshot;
import com.exchange.domain.Command;
import com.exchange.domain.ExecStatus;
import com.exchange.domain.ExecutionReport;
import com.exchange.domain.Order;
import com.exchange.domain.OrderType;
import com.exchange.domain.Side;
import com.exchange.domain.Trade;
import com.exchange.engine.EngineOutput;
import com.exchange.engine.MatchingEngine;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * The live market: one {@link MatchingEngine} from the lowlatency-matching-engine project, driven
 * by visitors and by a {@link MarketMaker} bot.
 *
 * <h2>One writer</h2>
 * The engine is single-threaded by design (in the original it sits behind a Disruptor ring), so
 * here every {@link MatchingEngine#process} call — visitor orders, bot quotes, cancels, the
 * hourly reset — runs on the one {@code matching-engine} thread. HTTP handlers hand work to it
 * and wait. Everything below marked "engine thread" is touched by nothing else.
 *
 * <h2>Depth</h2>
 * The book only exposes its top of book, so a {@link DepthLadder} is maintained from the
 * execution reports, and after every command its best bid/ask (price and size) is compared with
 * {@code book().snapshot()}. {@code mismatches} in the state counts any disagreement; it should
 * stay 0. One subtlety: the engine cancels lazily, so a level whose orders were all cancelled can
 * linger at the top with size 0 until the matcher sweeps it — such a ghost level is skipped by the
 * check, since the ladder (correctly) no longer has it.
 */
final class Exchange {

    enum Owner { BOT, VISITOR }

    /** An order of ours that the engine currently has resting. */
    record Resting(long id, Side side, long price, Owner owner, long placedAtMs) {}

    /** What a visitor gets back for an order. */
    record Result(long id, List<ExecutionReport> reports, List<Trade> trades) {}

    static final long VISITOR_ORDER_TTL_MS = 120_000;
    static final int MAX_VISITOR_RESTING = 300;
    static final long RESET_EVERY_MS = 3_600_000;
    private static final int DEPTH_LEVELS = 10;
    private static final int RECENT_PRINTS = 12;

    private final ScheduledExecutorService engineThread = Executors.newSingleThreadScheduledExecutor(
            RaftCluster.daemon("matching-engine"));

    // ---- engine thread only ----
    private MatchingEngine engine = new MatchingEngine();
    private final DepthLadder ladder = new DepthLadder();
    private final Map<Long, Resting> resting = new LinkedHashMap<>(); // insertion = age order
    private final Deque<long[]> prints = new ArrayDeque<>();           // [id, price, qty, side, ms]
    private final MarketMaker bot = new MarketMaker();
    private long nextId = 1;
    private long nextSeq = 1;
    private long trades, orders, checks, mismatches;
    private long lastResetMs = System.currentTimeMillis();

    // ---- published for other threads ----
    private volatile String view = "{}";
    private volatile long mid = MarketMaker.START_MID;

    void start() {
        engineThread.execute(this::publish);
        scheduleTick();
    }

    void stop() {
        engineThread.shutdownNow();
    }

    /** The latest book state as JSON (built on the engine thread after every change). */
    String json() { return view; }

    /** Mid price visitors' limit prices are validated against. */
    long mid() { return mid; }

    /** Place a visitor order and wait for the engine's answer. */
    Result submit(Side side, OrderType type, long price, long qty)
            throws TimeoutException, InterruptedException {
        return onEngine(() -> {
            evictOldestVisitorIfFull();
            return place(Owner.VISITOR, side, type, price, qty);
        });
    }

    // ============================ engine thread ============================

    /** A new order through the engine; returns its own reports and the trades it caused. */
    Result place(Owner owner, Side side, OrderType type, long price, long qty) {
        long now = System.currentTimeMillis();
        Order order = new Order(nextId++, side, type, type == OrderType.LIMIT ? price : 0, qty,
                nextSeq++, System.nanoTime());
        Collector out = new Collector();
        engine.process(new Command.NewOrder(order), out);
        orders++;

        List<ExecutionReport> mine = new ArrayList<>(1);
        for (Trade t : out.trades) record(t, now);
        for (ExecutionReport r : out.reports) {
            if (r.orderId() == order.id()) {
                mine.add(r);
                if (restsAfter(order, r)) {
                    ladder.add(side, order.price(), r.remainingQuantity());
                    resting.put(order.id(), new Resting(order.id(), side, order.price(), owner, now));
                }
            } else {
                onMakerFill(r);
            }
        }
        afterCommand();
        return new Result(order.id(), mine, out.trades);
    }

    /** Cancel one of our resting orders. */
    void cancel(long orderId) {
        Resting o = resting.remove(orderId);
        Collector out = new Collector();
        engine.process(new Command.CancelOrder(orderId, nextSeq++, System.nanoTime()), out);
        for (ExecutionReport r : out.reports) {
            if (r.status() == ExecStatus.CANCELLED && o != null) {
                ladder.reduce(o.side(), o.price(), r.remainingQuantity());
            }
        }
        afterCommand();
    }

    /** Resting orders, oldest first. A copy, so callers may cancel while iterating. */
    List<Resting> restingOrders() { return new ArrayList<>(resting.values()); }

    /** Best bid/ask as the ladder sees it (verified against the engine), 0 when a side is empty. */
    long bestBid() { return ladder.bestPrice(Side.BUY); }

    long bestAsk() { return ladder.bestPrice(Side.SELL); }

    private static boolean restsAfter(Order order, ExecutionReport r) {
        return order.isLimit() && r.remainingQuantity() > 0
                && (r.status() == ExecStatus.ACCEPTED || r.status() == ExecStatus.PARTIALLY_FILLED);
    }

    /** A resting (maker) order traded: shrink its level; drop it once fully filled. */
    private void onMakerFill(ExecutionReport r) {
        Resting m = resting.get(r.orderId());
        if (m == null) { mismatches++; return; }
        if (r.status() == ExecStatus.FILLED || r.status() == ExecStatus.PARTIALLY_FILLED) {
            ladder.reduce(m.side(), m.price(), r.lastQuantity());
        }
        if (r.status() == ExecStatus.FILLED) resting.remove(r.orderId());
    }

    private void record(Trade t, long nowMs) {
        trades++;
        prints.addFirst(new long[]{t.tradeId(), t.price(), t.quantity(), t.takerSide().ordinal(), nowMs});
        while (prints.size() > RECENT_PRINTS) prints.removeLast();
    }

    private void afterCommand() {
        verify();
        long bid = ladder.bestPrice(Side.BUY), ask = ladder.bestPrice(Side.SELL);
        mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : bot.mid();
    }

    /** Cross-check the rebuilt ladder against the engine's own top of book. */
    private void verify() {
        BookSnapshot s = engine.book().snapshot();
        checks++;
        if (!agrees(Side.BUY, s.bestBidPrice(), s.bestBidQuantity())
                || !agrees(Side.SELL, s.bestAskPrice(), s.bestAskQuantity())) {
            mismatches++;
            System.err.printf("depth mismatch: engine %s vs ladder bid %d/%d ask %d/%d%n", s,
                    ladder.bestPrice(Side.BUY), ladder.bestQuantity(Side.BUY),
                    ladder.bestPrice(Side.SELL), ladder.bestQuantity(Side.SELL));
        }
    }

    private boolean agrees(Side side, long enginePrice, long engineQty) {
        if (enginePrice == 0) return ladder.bestPrice(side) == 0;   // side empty
        if (engineQty == 0) return true;                            // lazily-cancelled ghost level
        return ladder.bestPrice(side) == enginePrice && ladder.bestQuantity(side) == engineQty;
    }

    private void evictOldestVisitorIfFull() {
        long n = resting.values().stream().filter(o -> o.owner() == Owner.VISITOR).count();
        if (n < MAX_VISITOR_RESTING) return;
        resting.values().stream().filter(o -> o.owner() == Owner.VISITOR).findFirst()
                .ifPresent(o -> cancel(o.id()));
    }

    // ---- periodic housekeeping + the bot ----

    private void scheduleTick() {
        long delay = ThreadLocalRandom.current().nextLong(300, 601);
        engineThread.schedule(this::tick, delay, TimeUnit.MILLISECONDS);
    }

    private void tick() {
        try {
            long now = System.currentTimeMillis();
            if (now - lastResetMs >= RESET_EVERY_MS) reset(now);
            expireVisitorOrders(now);
            bot.step(this, now);
            publish();
        } catch (Throwable t) {
            System.err.println("exchange tick: " + t);
        } finally {
            if (!engineThread.isShutdown()) scheduleTick();
        }
    }

    private void expireVisitorOrders(long now) {
        for (Resting o : restingOrders()) {
            if (o.owner() == Owner.VISITOR && now - o.placedAtMs() >= VISITOR_ORDER_TTL_MS) cancel(o.id());
        }
    }

    /** Hourly: a fresh engine and an empty book. Order ids keep counting, totals keep accumulating. */
    private void reset(long now) {
        engine = new MatchingEngine();
        ladder.clear();
        resting.clear();
        prints.clear();
        bot.reset();
        lastResetMs = now;
        System.out.println("exchange: hourly book reset");
    }

    private void publish() {
        List<String> last = new ArrayList<>(prints.size());
        for (long[] p : prints) {
            last.add("[" + p[0] + "," + p[1] + "," + p[2] + "," + Json.quote(Side.values()[(int) p[3]].name())
                    + "," + p[4] + "]");
        }
        view = Json.obj()
                .raw("bids", Json.rows(ladder.top(Side.BUY, DEPTH_LEVELS)))
                .raw("asks", Json.rows(ladder.top(Side.SELL, DEPTH_LEVELS)))
                .raw("last", Json.array(last))
                .put("trades", trades)
                .put("orders", orders)
                .put("bestBid", ladder.bestPrice(Side.BUY))
                .put("bestAsk", ladder.bestPrice(Side.SELL))
                .put("resting", resting.size())
                .put("checks", checks)
                .put("mismatches", mismatches)
                .toString();
    }

    private <T> T onEngine(Callable<T> work) throws TimeoutException, InterruptedException {
        try {
            return engineThread.submit(() -> {
                T r = work.call();
                publish();
                return r;
            }).get(2, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof RuntimeException re) throw re;
            throw new IllegalStateException(c);
        }
    }

    /** Collects one command's output; runs on the engine thread, so plain lists are fine. */
    private static final class Collector implements EngineOutput {
        final List<Trade> trades = new ArrayList<>();
        final List<ExecutionReport> reports = new ArrayList<>();

        @Override public void onTrade(Trade trade) { trades.add(trade); }

        @Override public void onReport(ExecutionReport report) { reports.add(report); }
    }
}
