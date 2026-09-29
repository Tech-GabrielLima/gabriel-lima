package live;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A token bucket per client IP: {@code ratePerSecond} tokens refill continuously up to
 * {@code burst}; each request spends one. Idle buckets (full again) are swept so the map cannot
 * grow without bound.
 */
final class RateLimiter {

    private static final long IDLE_NANOS = 60_000_000_000L;

    private final double ratePerNano;
    private final double burst;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    RateLimiter(double ratePerSecond, int burst) {
        this.ratePerNano = ratePerSecond / 1e9;
        this.burst = burst;
    }

    boolean tryAcquire(String key) {
        return buckets.computeIfAbsent(key, k -> new Bucket(burst)).take(ratePerNano, burst);
    }

    /** Drop buckets untouched for a minute (they would be full anyway). */
    void sweep() {
        long now = System.nanoTime();
        buckets.values().removeIf(b -> b.idleSince(now) > IDLE_NANOS);
    }

    private static final class Bucket {
        private double tokens;
        private long last = System.nanoTime();

        Bucket(double tokens) { this.tokens = tokens; }

        synchronized boolean take(double ratePerNano, double burst) {
            long now = System.nanoTime();
            tokens = Math.min(burst, tokens + (now - last) * ratePerNano);
            last = now;
            if (tokens < 1) return false;
            tokens -= 1;
            return true;
        }

        synchronized long idleSince(long now) { return now - last; }
    }
}
