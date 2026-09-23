package live;

import io.raftkv.kv.KvClient;
import io.raftkv.kv.KvResult;
import io.raftkv.kv.KvServer;
import io.raftkv.kv.ServerProvider;
import io.raftkv.net.SimulatedNetwork;
import io.raftkv.raft.ApplyMsg;
import io.raftkv.raft.InMemoryPersister;
import io.raftkv.raft.Persister;
import io.raftkv.raft.RaftConfig;
import io.raftkv.raft.RaftNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * A five-node raftkv cluster, shared by every visitor. It is wired exactly like raftkv's own
 * {@code RaftKvHttpServer} — {@link RaftNode}s over the in-process {@link SimulatedNetwork}, each
 * with a {@link KvServer} on its apply channel — and exposes the two things a visitor can do to
 * it: cut a node off the network, and append to a replicated key through consensus.
 *
 * <h2>Keeping a majority</h2>
 * At most {@link #MAX_DOWN} of the five nodes may be disconnected at once, so three can always
 * elect a leader and commit. A disconnected node heals itself after {@link #HEAL_AFTER_MS}.
 *
 * <h2>What "role" means here</h2>
 * {@link RaftNode} only exposes whether it believes it is the leader ({@link RaftNode#getState()});
 * candidate is internal. So a node reports {@code leader} or {@code follower}, plus the leader it
 * currently follows. Note that raftkv has no check-quorum: a leader cut off from the others keeps
 * believing it leads (in a stale term) until it reconnects and hears a higher term — that is real
 * Raft behaviour and it is shown as is. The cluster-level {@code leader} is the leader among the
 * connected nodes.
 */
final class RaftCluster {

    static final int SIZE = 5;
    static final int MAX_DOWN = 2;
    static final long HEAL_AFTER_MS = 30_000;
    private static final String CLAPS_KEY = "claps";
    private static final long CLAP_TIMEOUT_MS = 2_000;

    enum Toggle { OK, QUORUM }

    record Clap(int claps, long index, int leader) {}

    private final RaftNode[] rafts = new RaftNode[SIZE];
    private final KvServer[] servers = new KvServer[SIZE];
    private final long[] healAt = new long[SIZE]; // 0 = connected; guarded by `this`
    private SimulatedNetwork net;

    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor(
            daemon("raft-timers"));
    /** Claps are serialised through one client (KvClient is not thread-safe); the queue is bounded. */
    private final ThreadPoolExecutor clapper = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(16), daemon("raft-clapper"));
    private KvClient clapClient;
    private volatile int claps;

    void start() {
        net = new SimulatedNetwork(SIZE, System.nanoTime());
        net.setReliable(true);
        Set<Integer> members = new LinkedHashSet<>();
        for (int i = 0; i < SIZE; i++) members.add(i);
        RaftConfig cfg = RaftConfig.defaults().withNoop(true);
        for (int i = 0; i < SIZE; i++) {
            Persister persister = new InMemoryPersister();
            BlockingQueue<ApplyMsg> applyCh = new LinkedBlockingQueue<>();
            RaftNode raft = new RaftNode(i, members, net.transportFor(i), persister, applyCh, cfg);
            KvServer server = new KvServer(raft, applyCh, persister, -1);
            rafts[i] = raft;
            servers[i] = server;
            net.setHandler(i, raft);
            server.start();
            raft.start();
        }
        clapClient = new KvClient(new ServerProvider() {
            @Override public int size() { return SIZE; }
            @Override public KvServer server(int i) { return servers[i]; }
            @Override public boolean isUp(int i) { return isConnected(i); }
        }, 1);
        timers.scheduleWithFixedDelay(guard(this::healDue), 200, 200, TimeUnit.MILLISECONDS);
        timers.scheduleWithFixedDelay(guard(this::readClaps), 1, 2, TimeUnit.SECONDS);
    }

    void stop() {
        timers.shutdownNow();
        clapper.shutdownNow();
        for (int i = 0; i < SIZE; i++) { servers[i].kill(); rafts[i].kill(); }
        if (net != null) net.shutdown();
    }

    // ============================ visitor actions ============================

    /** Disconnect a connected node, or reconnect a disconnected one. */
    synchronized Toggle toggle(int id) {
        if (healAt[id] != 0) {
            reconnect(id);
            return Toggle.OK;
        }
        if (downCount() >= MAX_DOWN) return Toggle.QUORUM;
        net.disconnect(id);
        healAt[id] = System.currentTimeMillis() + HEAL_AFTER_MS;
        return Toggle.OK;
    }

    /**
     * Append one "+" to the replicated key through consensus and read the new length back with a
     * linearizable ReadIndex read on the leader.
     *
     * @throws TimeoutException if no leader committed it within {@link #CLAP_TIMEOUT_MS} (the
     *                          append may still land afterwards: KvClient keeps retrying it)
     * @throws IllegalStateException if too many claps are already queued
     */
    Clap clap() throws TimeoutException, InterruptedException {
        long deadline = System.currentTimeMillis() + CLAP_TIMEOUT_MS;
        Future<Clap> f;
        try {
            f = clapper.submit(() -> {
                clapClient.append(CLAPS_KEY, "+");
                return readBackUntil(deadline);
            });
        } catch (java.util.concurrent.RejectedExecutionException e) {
            throw new IllegalStateException("busy");
        }
        try {
            Clap c = f.get(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
            if (c == null) throw new TimeoutException("committed, but no leader to read it back");
            return c;
        } catch (ExecutionException e) {
            throw new TimeoutException("no leader: " + e.getCause().getMessage());
        }
    }

    /** The append committed; read it back, riding out an election that may be under way. */
    private Clap readBackUntil(long deadline) throws InterruptedException {
        while (System.currentTimeMillis() < deadline) {
            Clap c = readClaps();
            if (c != null) return c;
            Thread.sleep(20);
        }
        return null;
    }

    // ============================ state ============================

    /** The leader among connected nodes (highest term wins), or -1 mid-election. */
    int leader() {
        int best = -1;
        long bestTerm = -1;
        for (int i = 0; i < SIZE; i++) {
            if (!isConnected(i)) continue;
            long[] st = rafts[i].getState();
            if (st[1] == 1 && st[0] > bestTerm) { best = i; bestTerm = st[0]; }
        }
        return best;
    }

    String json() {
        List<String> nodes = new ArrayList<>(SIZE);
        long[] heal = new long[SIZE];
        for (int i = 0; i < SIZE; i++) {
            RaftNode r = rafts[i];
            long[] st = r.getState();
            heal[i] = healAtOf(i);
            nodes.add(Json.obj()
                    .put("id", i)
                    .put("up", heal[i] == 0)
                    .put("role", st[1] == 1 ? "leader" : "follower")
                    .put("term", st[0])
                    .put("commit", r.commitIndex())
                    .put("last", r.lastLogIndex())
                    .put("sees", r.leaderId())
                    .toString());
        }
        return Json.obj()
                .raw("nodes", Json.array(nodes))
                .put("leader", leader())
                .put("rpcs", net.rpcCount())
                .put("claps", claps)
                .raw("healAt", Json.array(heal))
                .toString();
    }

    // ============================ internals ============================

    private synchronized boolean isConnected(int id) { return healAt[id] == 0; }

    private synchronized long healAtOf(int id) { return healAt[id]; }

    private int downCount() {
        int n = 0;
        for (long h : healAt) if (h != 0) n++;
        return n;
    }

    private void reconnect(int id) {
        net.connect(id);
        healAt[id] = 0;
    }

    private synchronized void healDue() {
        long now = System.currentTimeMillis();
        for (int i = 0; i < SIZE; i++) if (healAt[i] != 0 && now >= healAt[i]) reconnect(i);
    }

    /**
     * Read the replicated value on the current leader via ReadIndex (linearizable, and no log
     * entry written), or null if there is no leader able to confirm its leadership right now.
     */
    private Clap readClaps() {
        int l = leader();
        if (l < 0) return null;
        KvResult r = servers[l].getReadIndex(CLAPS_KEY);
        if (!r.ok() || r.value() == null) return null;
        claps = r.value().length();
        return new Clap(claps, rafts[l].commitIndex(), l);
    }

    private static Runnable guard(Runnable r) {
        return () -> {
            try { r.run(); } catch (Throwable t) { System.err.println("raft timer: " + t); }
        };
    }

    static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }
}
