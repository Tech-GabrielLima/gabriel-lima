package live;

import com.exchange.domain.OrderType;
import com.exchange.domain.Side;

import java.util.List;
import java.util.Random;

/**
 * A deliberately simple market-maker bot so the book is never empty. Its orders are tagged
 * {@link Exchange.Owner#BOT} internally; to the engine they are ordinary orders.
 *
 * <p>Each step the mid price takes a small random walk (gently pulled back toward
 * {@link #START_MID}), the bot quotes one to three small limit orders a few ticks either side of
 * it, and now and then sends a small market order so trades print. Stale quotes — too old or
 * drifted too far from mid — are cancelled, and the bot never keeps more than
 * {@link #MAX_RESTING} orders in the book. Runs on the engine thread only.
 */
final class MarketMaker {

    static final long START_MID = 10_000;
    static final int MAX_RESTING = 60;
    private static final long MAX_DISTANCE = 12;       // ticks from mid before a quote is pulled
    private static final long MAX_AGE_MS = 20_000;
    private static final double CROSS_PROBABILITY = 0.15;

    private final Random rnd = new Random();
    private long mid = START_MID;

    long mid() { return mid; }

    void reset() { mid = START_MID; }

    void step(Exchange ex, long now) {
        walk();
        int quotes = 1 + rnd.nextInt(3);
        for (int i = 0; i < quotes; i++) quote(ex);
        if (rnd.nextDouble() < CROSS_PROBABILITY) cross(ex);
        pullStale(ex, now);
    }

    /** ±1 tick, with a slight drift back toward the starting mid so it never wanders off. */
    private void walk() {
        double r = rnd.nextDouble();
        double pullUp = mid < START_MID ? 0.05 : mid > START_MID ? -0.05 : 0;
        if (r < 0.30 + pullUp) mid++;
        else if (r > 0.70 + pullUp) mid--;
    }

    /** A passive limit order 1..8 ticks away from mid (so the spread is at least 2 ticks). */
    private void quote(Exchange ex) {
        Side side = rnd.nextBoolean() ? Side.BUY : Side.SELL;
        long offset = 1 + rnd.nextInt(8);
        long price = side == Side.BUY ? mid - offset : mid + offset;
        ex.place(Exchange.Owner.BOT, side, OrderType.LIMIT, price, 1 + rnd.nextInt(6));
    }

    /** A small market order that takes liquidity, so the tape keeps moving. */
    private void cross(Exchange ex) {
        Side side = rnd.nextBoolean() ? Side.BUY : Side.SELL;
        ex.place(Exchange.Owner.BOT, side, OrderType.MARKET, 0, 1 + rnd.nextInt(4));
    }

    private void pullStale(Exchange ex, long now) {
        List<Exchange.Resting> mine = ex.restingOrders().stream()
                .filter(o -> o.owner() == Exchange.Owner.BOT).toList();
        int left = mine.size();
        for (Exchange.Resting o : mine) {           // oldest first
            boolean stale = now - o.placedAtMs() > MAX_AGE_MS || Math.abs(o.price() - mid) > MAX_DISTANCE;
            if (stale || left > MAX_RESTING) {
                ex.cancel(o.id());
                left--;
            }
        }
    }
}
