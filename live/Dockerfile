# Stage 1: fetch Gabriel's two public repos at pinned commits and compile everything from source.
FROM eclipse-temurin:21-jdk AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG RAFTKV_REPO=https://github.com/Tech-GabrielLima/raft-kv-store.git
ARG RAFTKV_SHA=c5f1083c264c3921a61fe400b04309c9fdff66c7
ARG EXCHANGE_REPO=https://github.com/Tech-GabrielLima/lowlatency-matching-engine.git
ARG EXCHANGE_SHA=f1714ed6c5d2c5a73c9a1b09d75fd44fc4861411
WORKDIR /src
RUN git clone "$RAFTKV_REPO" raftkv && git -C raftkv checkout --quiet "$RAFTKV_SHA" \
 && git clone "$EXCHANGE_REPO" exchange && git -C exchange checkout --quiet "$EXCHANGE_SHA"
COPY build.sh /src/live/build.sh
COPY src /src/live/src
RUN RAFTKV_SRC=/src/raftkv EXCHANGE_SRC=/src/exchange /src/live/build.sh

# Stage 2: just the JRE and the jar.
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/live/build/live.jar /app/live.jar
# Render sets PORT itself; 8787 is the default elsewhere.
ENV PORT=8787
EXPOSE 8787
# Render's free plan is 512 MB and a tenth of a CPU: a serial GC and small stacks wake faster and use less.
CMD ["java", "-XX:MaxRAMPercentage=75", "-XX:+UseSerialGC", "-Xss512k", "-XX:TieredStopAtLevel=1", "-jar", "/app/live.jar"]
