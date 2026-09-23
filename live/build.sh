#!/usr/bin/env bash
# Compile the live service together with Gabriel's code, straight from source checkouts:
#   - raftkv:           everything under src/main/java (plain Java, zero runtime deps)
#   - matching engine:  only com.exchange.engine and com.exchange.domain (the Spring-free core)
# Output: build/live.jar (runnable: java -jar build/live.jar). Uses $JAVA_HOME/bin if set.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RAFTKV_SRC="${RAFTKV_SRC:-$HERE/../../portfolio/raftkv}"
EXCHANGE_SRC="${EXCHANGE_SRC:-$HERE/../../portfolio/exchange}"
OUT="$HERE/build"

for d in "$RAFTKV_SRC/src/main/java" "$EXCHANGE_SRC/src/main/java/com/exchange/engine" \
         "$EXCHANGE_SRC/src/main/java/com/exchange/domain"; do
  [[ -d "$d" ]] || { echo "missing source directory: $d" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$OUT/classes"
{
  find "$HERE/src" -name '*.java'
  find "$RAFTKV_SRC/src/main/java" -name '*.java'
  ls "$EXCHANGE_SRC"/src/main/java/com/exchange/engine/*.java
  ls "$EXCHANGE_SRC"/src/main/java/com/exchange/domain/*.java
} > "$OUT/sources.txt"

"${JAVA_HOME:+$JAVA_HOME/bin/}javac" --release 21 -encoding UTF-8 -d "$OUT/classes" @"$OUT/sources.txt"
"${JAVA_HOME:+$JAVA_HOME/bin/}jar" --create --file "$OUT/live.jar" --main-class live.LiveServer -C "$OUT/classes" .
echo "built $OUT/live.jar ($(wc -l < "$OUT/sources.txt") source files)"
