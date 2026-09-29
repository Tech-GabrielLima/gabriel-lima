package live;

import com.exchange.domain.ExecutionReport;
import com.exchange.domain.OrderType;
import com.exchange.domain.Side;
import com.exchange.domain.Trade;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.management.ManagementFactory;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The live backend of the portfolio: Gabriel's actual research code, running for everyone who is
 * on the site at the same moment. A five-node <b>raftkv</b> cluster and the <b>matching engine</b>
 * run in this one process; visitors watch them over Server-Sent Events and poke them over a
 * handful of POSTs. The edge is the JDK's built-in {@link HttpServer}, as in raftkv's own demo, so
 * the whole service has zero dependencies.
 *
 * <pre>
 *   ./build.sh &amp;&amp; java -jar build/live.jar            (PORT=8787 by default)
 *
 *   curl -N localhost:8787/live/events                   # state every 250 ms
 *   curl -XPOST localhost:8787/live/raft/2/toggle        # cut node 2 off the network
 *   curl -XPOST localhost:8787/live/raft/clap            # append through consensus
 *   curl -XPOST localhost:8787/live/order -d '{"side":"BUY","type":"MARKET","qty":3}'
 * </pre>
 */
public final class LiveServer {

    private static final int MAX_BODY_BYTES = 4096;
    private static final long MAX_ORDER_QTY = 50;
    private static final long MAX_PRICE_DISTANCE = 60;
    private static final Pattern TOGGLE = Pattern.compile("/live/raft/(\\d+)/toggle");

    private final long startedMs = System.currentTimeMillis();
    private final RaftCluster raft = new RaftCluster();
    private final Exchange exchange = new Exchange();
    private final Broadcaster sse = new Broadcaster(this::stateJson);
    private final RateLimiter limiter = new RateLimiter(5, 10);
    private final AtomicLong tickets = new AtomicLong();
    private final AtomicLong requests = new AtomicLong();
    private final Set<String> allowedOrigins;
    private final ScheduledExecutorService housekeeping = Executors.newSingleThreadScheduledExecutor(
            RaftCluster.daemon("housekeeping"));
    private HttpServer http;

    private LiveServer(Set<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(env("PORT", "8787"));
        Set<String> origins = Set.copyOf(Arrays.stream(env("ALLOWED_ORIGINS", "*").split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList());
        new LiveServer(origins).run(port);
    }

    private void run(int port) throws IOException {
        raft.start();
        exchange.start();
        sse.start();
        housekeeping.scheduleWithFixedDelay(limiter::sweep, 1, 1, TimeUnit.MINUTES);

        http = HttpServer.create(new InetSocketAddress(port), 0);
        http.createContext("/live", this::handle);
        http.createContext("/", ex -> respond(ex, 404, error("not found")));
        // one virtual thread per request: an SSE subscriber parks its thread for as long as it
        // watches, which costs next to nothing with virtual threads
        http.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        http.start();
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown, "shutdown"));
        System.out.printf("live on http://localhost:%d/live  (raftkv x%d, matching engine, origins %s)%n",
                port, RaftCluster.SIZE, allowedOrigins);
    }

    private void shutdown() {
        System.out.println("live: shutting down");
        sse.stop();
        if (http != null) http.stop(1);
        housekeeping.shutdownNow();
        exchange.stop();
        raft.stop();
    }

    // ============================ routing ============================

    private void handle(HttpExchange ex) {
        requests.incrementAndGet();
        try (ex) {
            cors(ex);
            String method = ex.getRequestMethod();
            if ("OPTIONS".equals(method)) { ex.sendResponseHeaders(204, -1); return; }
            if ("POST".equals(method) && !limiter.tryAcquire(clientIp(ex))) {
                respond(ex, 429, error("rate limited"));
                return;
            }
            route(ex, method, ex.getRequestURI().getPath());
        } catch (Throwable t) {
            System.err.println("request " + ex.getRequestURI() + ": " + t);
            try { respond(ex, 500, error("internal")); } catch (Throwable ignored) { /* already sent */ }
        }
    }

    private void route(HttpExchange ex, String method, String path) throws Exception {
        Matcher toggle = TOGGLE.matcher(path);
        switch (path) {
            case "/live/health" -> only(ex, method, "GET", () -> respond(ex, 200, "{\"ok\":true}"));
            case "/live/events" -> only(ex, method, "GET", () -> events(ex));
            case "/live/ticket" -> only(ex, method, "POST", () -> ticket(ex));
            case "/live/raft/clap" -> only(ex, method, "POST", () -> clap(ex));
            case "/live/order" -> only(ex, method, "POST", () -> order(ex));
            default -> {
                if (toggle.matches()) only(ex, method, "POST", () -> toggle(ex, toggle.group(1)));
                else respond(ex, 404, error("not found"));
            }
        }
    }

    private interface Action { void run() throws Exception; }

    private static void only(HttpExchange ex, String method, String allowed, Action action) throws Exception {
        if (!allowed.equals(method)) {
            ex.getResponseHeaders().set("Allow", allowed + ", OPTIONS");
            respond(ex, 405, error("method not allowed"));
            return;
        }
        action.run();
    }

    // ============================ handlers ============================

    private void events(HttpExchange ex) throws IOException {
        if (!sse.serve(ex, clientIp(ex))) respond(ex, 503, error("too many viewers"));
    }

    private void ticket(HttpExchange ex) throws IOException {
        respond(ex, 200, Json.obj().put("n", tickets.incrementAndGet()).toString());
    }

    private void toggle(HttpExchange ex, String rawId) throws IOException {
        int id;
        try { id = Integer.parseInt(rawId); } catch (NumberFormatException e) { id = -1; }
        if (id < 0 || id >= RaftCluster.SIZE) { respond(ex, 404, error("no such node")); return; }
        if (raft.toggle(id) == RaftCluster.Toggle.QUORUM) { respond(ex, 409, error("quorum")); return; }
        respond(ex, 200, raft.json());
    }

    private void clap(HttpExchange ex) throws IOException, InterruptedException {
        try {
            RaftCluster.Clap c = raft.clap();
            respond(ex, 200, Json.obj().put("claps", c.claps()).put("index", c.index())
                    .put("leader", c.leader()).toString());
        } catch (TimeoutException e) {
            respond(ex, 503, error("no leader"));
        } catch (IllegalStateException e) {
            respond(ex, 503, error("busy"));
        }
    }

    private void order(HttpExchange ex) throws IOException, InterruptedException {
        Map<String, Object> body;
        try {
            body = Json.parseFlat(body(ex));
        } catch (IllegalArgumentException e) {
            respond(ex, 400, error(e.getMessage()));
            return;
        }
        Side side = enumOf(Side.class, body.get("side"));
        OrderType type = enumOf(OrderType.class, body.get("type"));
        Long qty = integer(body.get("qty"));
        Long price = integer(body.get("price"));
        String problem = validate(side, type, price, qty);
        if (problem != null) { respond(ex, 400, error(problem)); return; }

        Exchange.Result r;
        try {
            r = exchange.submit(side, type, type == OrderType.LIMIT ? price : 0, qty);
        } catch (TimeoutException e) {
            respond(ex, 503, error("engine busy"));
            return;
        }
        respond(ex, 200, orderJson(r));
    }

    private String validate(Side side, OrderType type, Long price, Long qty) {
        if (side == null) return "side must be BUY or SELL";
        if (type == null) return "type must be LIMIT or MARKET";
        if (qty == null || qty < 1 || qty > MAX_ORDER_QTY) return "qty must be an integer 1.." + MAX_ORDER_QTY;
        if (type == OrderType.LIMIT) {
            long mid = exchange.mid();
            if (price == null || Math.abs(price - mid) > MAX_PRICE_DISTANCE) {
                return "price must be an integer within " + MAX_PRICE_DISTANCE + " ticks of mid " + mid;
            }
        }
        return null;
    }

    private static String orderJson(Exchange.Result r) {
        List<String> reports = new ArrayList<>(r.reports().size());
        for (ExecutionReport rep : r.reports()) {
            reports.add(Json.obj()
                    .put("status", rep.status().name())
                    .put("filled", rep.filledQuantity())
                    .put("remaining", rep.remainingQuantity())
                    .put("lastPrice", rep.lastPrice())
                    .toString());
        }
        List<long[]> trades = new ArrayList<>(r.trades().size());
        for (Trade t : r.trades()) trades.add(new long[]{t.price(), t.quantity()});
        return Json.obj().put("id", r.id()).raw("reports", Json.array(reports))
                .raw("trades", Json.rows(trades)).toString();
    }

    // ============================ state ============================

    /** The whole shared state, as streamed on {@code /live/events}. */
    private String stateJson() {
        return Json.obj()
                .put("t", System.currentTimeMillis())
                .put("audience", sse.audience())
                .put("tickets", tickets.get())
                .raw("raft", raft.json())
                .raw("book", exchange.json())
                .raw("machine", machineJson())
                .toString();
    }

    private String machineJson() {
        Runtime rt = Runtime.getRuntime();
        return Json.obj()
                .put("uptime", (System.currentTimeMillis() - startedMs) / 1000)
                .put("java", Runtime.version().toString())
                .put("heapMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024))
                .put("threads", ManagementFactory.getThreadMXBean().getThreadCount())
                .put("events", sse.eventsSent())
                .put("requests", requests.get())
                .toString();
    }

    // ============================ HTTP plumbing ============================

    /** CORS: {@code *} by default, otherwise echo the Origin only if it is on the allow-list. */
    private void cors(HttpExchange ex) {
        Headers h = ex.getResponseHeaders();
        if (allowedOrigins.contains("*")) {
            h.set("Access-Control-Allow-Origin", "*");
        } else {
            String origin = ex.getRequestHeaders().getFirst("Origin");
            if (origin != null && allowedOrigins.contains(origin)) h.set("Access-Control-Allow-Origin", origin);
            h.set("Vary", "Origin");
        }
        h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        h.set("Access-Control-Allow-Headers", "Content-Type");
        h.set("Access-Control-Max-Age", "600");
    }

    /** The visitor's IP: Fly's header, else the first X-Forwarded-For hop, else the socket peer. */
    private static String clientIp(HttpExchange ex) {
        String fly = ex.getRequestHeaders().getFirst("Fly-Client-IP");
        if (fly != null && !fly.isBlank()) return fly.trim();
        String xff = ex.getRequestHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return ex.getRemoteAddress().getAddress().getHostAddress();
    }

    private static String body(HttpExchange ex) throws IOException {
        InputStream in = ex.getRequestBody();
        byte[] b = in.readNBytes(MAX_BODY_BYTES + 1);
        if (b.length > MAX_BODY_BYTES) throw new IllegalArgumentException("body too large");
        return new String(b, StandardCharsets.UTF_8);
    }

    private static void respond(HttpExchange ex, int code, String json) throws IOException {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    private static String error(String message) {
        return Json.obj().put("error", message).toString();
    }

    private static <E extends Enum<E>> E enumOf(Class<E> type, Object v) {
        if (!(v instanceof String s)) return null;
        try { return Enum.valueOf(type, s); } catch (IllegalArgumentException e) { return null; }
    }

    /** Only true integers: 3 is fine, 3.5 and "3" are not. */
    private static Long integer(Object v) {
        return v instanceof Long l ? l : null;
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }
}
