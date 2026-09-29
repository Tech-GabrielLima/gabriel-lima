package live;

import com.exchange.domain.Side;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Price → resting quantity, per side. The engine's {@code OrderBook} deliberately exposes only
 * the top of book, so the depth a visitor sees is rebuilt here purely from the execution reports
 * the engine emits, and cross-checked against {@code OrderBook.snapshot()} after every command
 * (see {@link Exchange}). Touched only by the matching thread.
 */
final class DepthLadder {

    private final TreeMap<Long, Long> bids = new TreeMap<>(Collections.reverseOrder());
    private final TreeMap<Long, Long> asks = new TreeMap<>();

    private TreeMap<Long, Long> side(Side side) {
        return side == Side.BUY ? bids : asks;
    }

    void add(Side side, long price, long qty) {
        side(side).merge(price, qty, Long::sum);
    }

    /** Remove {@code qty} at {@code price}; a level that reaches zero disappears. */
    void reduce(Side side, long price, long qty) {
        side(side).computeIfPresent(price, (p, q) -> q - qty > 0 ? q - qty : null);
    }

    /** Best price on a side, or 0 if the side is empty (the engine's own convention). */
    long bestPrice(Side side) {
        TreeMap<Long, Long> m = side(side);
        return m.isEmpty() ? 0 : m.firstKey();
    }

    long bestQuantity(Side side) {
        TreeMap<Long, Long> m = side(side);
        return m.isEmpty() ? 0 : m.firstEntry().getValue();
    }

    /** The best {@code n} levels as {@code [price, qty]} rows, best first. */
    List<long[]> top(Side side, int n) {
        List<long[]> out = new ArrayList<>(n);
        for (Map.Entry<Long, Long> e : side(side).entrySet()) {
            if (out.size() == n) break;
            out.add(new long[]{e.getKey(), e.getValue()});
        }
        return out;
    }

    void clear() {
        bids.clear();
        asks.clear();
    }
}
