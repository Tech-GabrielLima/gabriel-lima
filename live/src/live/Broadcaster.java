package live;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Server-Sent Events fan-out. One broadcaster thread renders the shared state every
 * {@link #INTERVAL_MS} into a single frame; each connected client is served by its own (virtual)
 * request thread, which waits for the next frame and writes it. So the state is computed once per
 * tick no matter how many people watch, and a slow client only ever delays itself — it simply
 * skips to the latest frame. A client whose write fails is dropped.
 *
 * <p>Waiting uses a {@link ReentrantLock}/{@link Condition} rather than {@code Object.wait()},
 * which would pin the carrier thread of a virtual thread on Java 21.
 */
final class Broadcaster {

    static final int MAX_CLIENTS = 500;
    static final int MAX_CLIENTS_PER_IP = 10;
    private static final long INTERVAL_MS = 250;
    private static final long PING_MS = 15_000;

    private final Supplier<String> state;
    private final AtomicInteger clients = new AtomicInteger();
    private final Map<String, AtomicInteger> perIp = new ConcurrentHashMap<>();
    private final AtomicLong sent = new AtomicLong();

    private final ReentrantLock lock = new ReentrantLock();
    private final Condition newFrame = lock.newCondition();
    private byte[] frame;        // guarded by lock
    private long frameSeq;       // guarded by lock
    private volatile boolean running = true;
    private Thread thread;

    Broadcaster(Supplier<String> state) { this.state = state; }

    int audience() { return clients.get(); }

    long eventsSent() { return sent.get(); }

    void start() {
        thread = new Thread(this::loop, "sse-broadcaster");
        thread.setDaemon(true);
        thread.start();
    }

    void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        lock.lock();
        try { newFrame.signalAll(); } finally { lock.unlock(); }
    }

    private void loop() {
        while (running) {
            try {
                publish(event(state.get()));
                Thread.sleep(INTERVAL_MS);
            } catch (InterruptedException e) {
                if (!running) return;
            } catch (Throwable t) {
                System.err.println("broadcaster: " + t); // never let one bad tick end the stream
            }
        }
    }

    private void publish(byte[] f) {
        lock.lock();
        try {
            frame = f;
            frameSeq++;
            newFrame.signalAll();
        } finally {
            lock.unlock();
        }
    }

    /**
     * Serve one subscriber until it goes away. Runs on the request's own thread and returns only
     * when the client disconnects (or the server stops).
     *
     * @return false if the client was refused because a cap was reached (nothing written yet)
     */
    boolean serve(HttpExchange ex, String ip) throws IOException {
        AtomicInteger mine = perIp.computeIfAbsent(ip, k -> new AtomicInteger());
        if (clients.incrementAndGet() > MAX_CLIENTS | mine.incrementAndGet() > MAX_CLIENTS_PER_IP) {
            leave(ip, mine);
            return false;
        }
        try {
            ex.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            ex.getResponseHeaders().set("Connection", "keep-alive");
            ex.getResponseHeaders().set("X-Accel-Buffering", "no");
            ex.sendResponseHeaders(200, 0); // 0 = chunked, open-ended
            OutputStream out = ex.getResponseBody();
            write(out, event(state.get()));  // current state right away
            stream(out);
        } catch (IOException e) {
            // client went away: the normal way for a stream to end
        } finally {
            leave(ip, mine);
            ex.close();
        }
        return true;
    }

    private void stream(OutputStream out) throws IOException {
        long seen;
        lock.lock();
        try { seen = frameSeq; } finally { lock.unlock(); }
        long lastPing = System.nanoTime();
        while (running) {
            byte[] next = null;
            lock.lock();
            try {
                long waitNanos = TimeUnit.MILLISECONDS.toNanos(PING_MS) - (System.nanoTime() - lastPing);
                while (running && frameSeq == seen && waitNanos > 0) {
                    waitNanos = newFrame.awaitNanos(waitNanos);
                }
                if (frameSeq != seen) { next = frame; seen = frameSeq; }
            } catch (InterruptedException e) {
                return;
            } finally {
                lock.unlock();
            }
            if (next != null) write(out, next);
            if (System.nanoTime() - lastPing >= TimeUnit.MILLISECONDS.toNanos(PING_MS)) {
                out.write(": ping\n\n".getBytes(StandardCharsets.UTF_8));
                out.flush();
                lastPing = System.nanoTime();
            }
        }
    }

    private void write(OutputStream out, byte[] f) throws IOException {
        out.write(f);
        out.flush();
        sent.incrementAndGet();
    }

    private void leave(String ip, AtomicInteger mine) {
        clients.decrementAndGet();
        if (mine.decrementAndGet() <= 0) perIp.remove(ip, mine);
    }

    private static byte[] event(String json) {
        return ("event: state\ndata: " + json + "\n\n").getBytes(StandardCharsets.UTF_8);
    }
}
