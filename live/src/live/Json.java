package live;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Just enough JSON for this service, so it stays dependency-free. Writing is a tiny fluent
 * {@link Obj} builder; reading is a parser for <em>flat</em> objects (string, number, boolean and
 * null values) — the only shape any request body here has. Anything else is rejected, which is
 * the right answer for untrusted input anyway.
 */
final class Json {

    private Json() {}

    /** A JSON object under construction. Keys are written in insertion order. */
    static final class Obj {
        private final StringBuilder sb = new StringBuilder("{");

        Obj put(String key, long value) { return raw(key, Long.toString(value)); }

        Obj put(String key, boolean value) { return raw(key, Boolean.toString(value)); }

        Obj put(String key, String value) { return raw(key, quote(value)); }

        /** Insert an already-encoded JSON value (a nested object or array). */
        Obj raw(String key, String json) {
            if (sb.length() > 1) sb.append(',');
            sb.append(quote(key)).append(':').append(json);
            return this;
        }

        @Override public String toString() { return sb + "}"; }
    }

    static Obj obj() { return new Obj(); }

    /** {@code [[a,b],[c,d]]} — price ladders and trade prints. */
    static String rows(Iterable<long[]> rows) {
        StringBuilder sb = new StringBuilder("[");
        for (long[] row : rows) {
            if (sb.length() > 1) sb.append(',');
            sb.append('[');
            for (int i = 0; i < row.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(row[i]);
            }
            sb.append(']');
        }
        return sb.append(']').toString();
    }

    /** {@code [a,b,c]}. */
    static String array(long[] values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(values[i]);
        }
        return sb.append(']').toString();
    }

    /** {@code [x,y,z]} of already-encoded values. */
    static String array(Iterable<String> encoded) {
        return "[" + String.join(",", encoded) + "]";
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }

    // ============================ reading ============================

    /**
     * Parse a flat JSON object. Numbers come back as {@link Long} when integral and {@link Double}
     * otherwise, so callers can insist on integers.
     *
     * @throws IllegalArgumentException on anything that is not a flat object
     */
    static Map<String, Object> parseFlat(String text) {
        return new Parser(text).object();
    }

    private static final class Parser {
        private final String s;
        private int i;

        Parser(String s) { this.s = s; }

        Map<String, Object> object() {
            Map<String, Object> out = new LinkedHashMap<>();
            ws();
            expect('{');
            ws();
            if (peek() == '}') { i++; return end(out); }
            while (true) {
                ws();
                String key = string();
                ws();
                expect(':');
                ws();
                out.put(key, value());
                ws();
                char c = next();
                if (c == '}') return end(out);
                if (c != ',') throw bad("expected , or }");
            }
        }

        private Map<String, Object> end(Map<String, Object> out) {
            ws();
            if (i != s.length()) throw bad("trailing characters");
            return out;
        }

        private Object value() {
            char c = peek();
            if (c == '"') return string();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            if (c == '-' || (c >= '0' && c <= '9')) return number();
            throw bad("unsupported value (only flat objects are accepted)");
        }

        private Object number() {
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            String n = s.substring(start, i);
            try {
                if (n.matches("-?\\d{1,18}")) return Long.parseLong(n);
                return Double.parseDouble(n);
            } catch (NumberFormatException e) {
                throw bad("bad number");
            }
        }

        private String string() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                char e = next();
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'n' -> sb.append('\n');
                    case 't' -> sb.append('\t');
                    case 'r' -> sb.append('\r');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'u' -> {
                        if (i + 4 > s.length()) throw bad("bad escape");
                        try {
                            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        } catch (NumberFormatException ex) {
                            throw bad("bad escape");
                        }
                        i += 4;
                    }
                    default -> throw bad("bad escape");
                }
            }
        }

        private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        private char peek() {
            if (i >= s.length()) throw bad("unexpected end");
            return s.charAt(i);
        }

        private char next() {
            char c = peek();
            i++;
            return c;
        }

        private void expect(char c) { if (next() != c) throw bad("expected " + c); }

        private IllegalArgumentException bad(String why) {
            return new IllegalArgumentException("invalid JSON at " + i + ": " + why);
        }
    }
}
