//! The cinema's memory: one Durable Object (SQLite) holding every ticket, every
//! accepted event and the night's numbers. One instance for the whole site, so
//! the numbers are exact and sequential.

use crate::frames;
use crate::judge::{self, Event, Visitor};
use crate::ticket;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use worker::*;

/// Heartbeats come every ~15 s while the page is visible; a longer gap is not counted as watching.
const MAX_CREDIT_MS: i64 = 20_000;
/// New tickets per address per window (kept in memory only, never stored).
const NEW_TICKETS_PER_WINDOW: u32 = 30;
const WINDOW_MS: i64 = 10 * 60_000;
const MAX_BATCH: usize = 64;

#[durable_object]
pub struct Cinema {
    state: State,
    env: Env,
    gate: RefCell<HashMap<String, (i64, u32)>>,
    /// When each visitor last wrote to someone (in memory: a short cooldown, not a record).
    pub(crate) wrote: RefCell<HashMap<i64, i64>>,
}

#[derive(Deserialize)]
pub(crate) struct Pass {
    pub(crate) id: String,
    pub(crate) n: i64,
    pub(crate) sig: String,
}

#[derive(Deserialize)]
struct VisitReq {
    #[serde(default)]
    ticket: Option<Pass>,
}

#[derive(Deserialize)]
struct SyncReq {
    ticket: Pass,
    #[serde(default)]
    events: Vec<Event>,
    /// The page was visible since the last sync, so the time in between counts as watching.
    #[serde(default)]
    visible: bool,
}

#[derive(Serialize)]
pub(crate) struct Stats {
    visitors: i64,
    explorers: i64,
    completed: i64,
    fastest_ms: Option<i64>,
    last_completion: Option<i64>,
    frames: usize,
    built: usize,
}

#[derive(Serialize)]
struct TicketOut {
    id: String,
    n: i64,
    sig: String,
}

#[derive(Serialize)]
struct Rejected {
    seq: i64,
    reason: &'static str,
    forged: bool,
}

#[derive(Serialize)]
struct Progress {
    found: Vec<String>,
    last_seq: i64,
    watched_ms: i64,
    forged: bool,
    completion: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct Row {
    pub(crate) n: i64,
    watched: i64,
    last_seen: i64,
    visible: i64,
    last_seq: i64,
    forged: i64,
    pub(crate) completion: Option<i64>,
}

#[derive(Deserialize)]
struct FrameRow {
    frame: String,
}

#[derive(Deserialize)]
pub(crate) struct V {
    pub(crate) v: Option<i64>,
}

pub(crate) fn now() -> i64 {
    Date::now().as_millis() as i64
}

pub(crate) fn json<T: Serialize>(v: &T) -> Result<Response> {
    Response::from_json(v)
}

impl DurableObject for Cinema {
    fn new(state: State, env: Env) -> Self {
        let sql = state.storage().sql();
        for q in [
            "CREATE TABLE IF NOT EXISTS visitors (
                id TEXT PRIMARY KEY, n INTEGER UNIQUE NOT NULL, created INTEGER NOT NULL,
                last_seen INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1, watched INTEGER NOT NULL DEFAULT 0,
                last_seq INTEGER NOT NULL DEFAULT 0, forged INTEGER NOT NULL DEFAULT 0,
                completion INTEGER, completed_at INTEGER)",
            // The log itself: one row per accepted event. Progress is whatever this replays to.
            "CREATE TABLE IF NOT EXISTS events (
                visitor TEXT NOT NULL, seq INTEGER NOT NULL, frame TEXT NOT NULL,
                at INTEGER NOT NULL, received INTEGER NOT NULL, watched INTEGER NOT NULL,
                PRIMARY KEY (visitor, frame))",
            "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)",
            // Messages between visitors online (house vocabulary only), frames of the collective film, notes for the next visitor.
            "CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_n INTEGER NOT NULL, from_n INTEGER NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS collective (n INTEGER PRIMARY KEY, completion INTEGER NOT NULL, frame TEXT NOT NULL, at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS leftnotes (n INTEGER PRIMARY KEY, text TEXT NOT NULL, at INTEGER NOT NULL)",
        ] {
            sql.exec(q, None).expect("schema");
        }
        Self { state, env, gate: RefCell::new(HashMap::new()), wrote: RefCell::new(HashMap::new()) }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        let path = req.path();
        let body = if req.method() == Method::Post { req.text().await? } else { String::new() };
        match path.as_str() {
            "/v1/visit" => self.visit(&req, &body),
            "/v1/sync" => self.sync(&body),
            "/v1/stats" => json(&self.stats()?),
            "/v1/count" => self.count(&body),
            "/v1/counts" => json(&self.counts()?),
            "/v1/stubs" => json(&self.stubs()?),
            "/v1/online" => json(&self.online()?),
            "/v1/write" => self.write(&body),
            "/v1/completions" => json(&self.completions()?),
            "/v1/film" if req.method() == Method::Post => self.film_add(&body),
            "/v1/film" => json(&self.film()?),
            "/v1/certificate" => self.certificate(&body),
            "/v1/verify" => self.verify(&body),
            "/v1/notes" if req.method() == Method::Post => self.note_add(&body),
            "/v1/notes" => json(&self.notes()?),
            _ => Response::error("Not found", 404),
        }
    }
}

/// Things the site counts for everyone, so the usher can say "87% of people click here".
/// A fixed list: nobody can make the server count anything else.
const COUNTED: &[&str] = &["dontclick", "reallydontclick", "admin", "konami", "sudo", "rightclick", "viewsource", "exit"];

#[derive(Deserialize)]
struct CountReq {
    key: String,
}

#[derive(Deserialize, Serialize)]
struct Stub {
    n: i64,
    created: i64,
}

#[derive(Deserialize)]
struct KV {
    k: String,
    v: i64,
}

impl Cinema {
    pub(crate) fn sql(&self) -> SqlStorage {
        self.state.storage().sql()
    }

    pub(crate) fn key(&self) -> Result<String> {
        Ok(self.env.secret("TICKET_KEY")?.to_string())
    }

    pub(crate) fn bump(&self, k: &str) -> Result<i64> {
        let r: V = self
            .sql()
            .exec("INSERT INTO meta (k, v) VALUES (?, 1) ON CONFLICT (k) DO UPDATE SET v = v + 1 RETURNING v", vec![k.into()])?
            .one()?;
        Ok(r.v.unwrap_or(0))
    }

    fn count(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<CountReq>(body) else {
            return Response::error("Bad request", 400);
        };
        if !COUNTED.contains(&q.key.as_str()) {
            return Response::error("Not counted", 404);
        }
        let n = self.bump(&format!("count.{}", q.key))?;
        json(&serde_json::json!({ "key": q.key, "n": n, "visitors": self.meta("visitors")? }))
    }

    fn counts(&self) -> Result<serde_json::Value> {
        let rows: Vec<KV> = self.sql().exec("SELECT k, v FROM meta WHERE k LIKE 'count.%'", None)?.to_array()?;
        let mut m = serde_json::Map::new();
        for r in rows {
            m.insert(r.k.trim_start_matches("count.").to_string(), r.v.into());
        }
        m.insert("visitors".into(), self.meta("visitors")?.into());
        Ok(serde_json::Value::Object(m))
    }

    /// The box office's drawer: ticket nº 1, and the last few sold (numbers and times only).
    fn stubs(&self) -> Result<serde_json::Value> {
        let first: Vec<Stub> = self.sql().exec("SELECT n, created FROM visitors WHERE n = 1", None)?.to_array()?;
        let last: Vec<Stub> = self.sql().exec("SELECT n, created FROM visitors ORDER BY n DESC LIMIT 11", None)?.to_array()?;
        Ok(serde_json::json!({ "first": first.first(), "last": last }))
    }

    pub(crate) fn meta(&self, k: &str) -> Result<i64> {
        let rows: Vec<V> = self.sql().exec("SELECT v FROM meta WHERE k = ?", vec![k.into()])?.to_array()?;
        Ok(rows.first().and_then(|r| r.v).unwrap_or(0))
    }

    pub(crate) fn stats(&self) -> Result<Stats> {
        let fastest: V = self
            .sql()
            .exec("SELECT MIN(completed_at - created) AS v FROM visitors WHERE completed_at IS NOT NULL", None)?
            .one()?;
        let last: V = self.sql().exec("SELECT MAX(completed_at) AS v FROM visitors", None)?.one()?;
        Ok(Stats {
            visitors: self.meta("visitors")?,
            explorers: self.meta("explorers")?,
            completed: self.meta("completed")?,
            fastest_ms: fastest.v,
            last_completion: last.v,
            frames: frames::total(),
            built: frames::built(),
        })
    }

    pub(crate) fn row(&self, id: &str) -> Result<Option<Row>> {
        let rows: Vec<Row> = self
            .sql()
            .exec(
                "SELECT n, watched, last_seen, visible, last_seq, forged, completion FROM visitors WHERE id = ?",
                vec![id.into()],
            )?
            .to_array()?;
        Ok(rows.into_iter().next())
    }

    fn found(&self, id: &str) -> Result<Vec<String>> {
        let rows: Vec<FrameRow> =
            self.sql().exec("SELECT frame FROM events WHERE visitor = ? ORDER BY seq", vec![id.into()])?.to_array()?;
        Ok(rows.into_iter().map(|r| r.frame).collect())
    }

    /// A valid ticket for this visitor, or None if it was tampered with or never issued.
    pub(crate) fn check(&self, p: &Pass) -> Result<Option<Row>> {
        if !ticket::verify(&self.key()?, &p.id, p.n, &p.sig) {
            return Ok(None);
        }
        Ok(self.row(&p.id)?.filter(|r| r.n == p.n))
    }

    fn allow_new(&self, req: &Request) -> bool {
        let who = req.headers().get("CF-Connecting-IP").ok().flatten().unwrap_or_default();
        let t = now();
        let mut gate = self.gate.borrow_mut();
        gate.retain(|_, (start, _)| t - *start < WINDOW_MS);
        let e = gate.entry(who).or_insert((t, 0));
        e.1 += 1;
        e.1 <= NEW_TICKETS_PER_WINDOW
    }

    fn progress(&self, id: &str, r: &Row) -> Result<Progress> {
        Ok(Progress {
            found: self.found(id)?,
            last_seq: r.last_seq,
            watched_ms: r.watched,
            forged: r.forged != 0,
            completion: r.completion,
        })
    }

    /// Arrival: an existing ticket is honoured, anything else gets the next number.
    fn visit(&self, req: &Request, body: &str) -> Result<Response> {
        let q: VisitReq = serde_json::from_str(body).unwrap_or(VisitReq { ticket: None });
        let key = self.key()?;
        if let Some(p) = q.ticket {
            if let Some(r) = self.check(&p)? {
                self.sql().exec("UPDATE visitors SET last_seen = ?, visible = 1 WHERE id = ?", vec![now().into(), p.id.as_str().into()])?;
                return json(&serde_json::json!({
                    "ticket": TicketOut { sig: ticket::sign(&key, &p.id, r.n), id: p.id.clone(), n: r.n },
                    "returning": true,
                    "progress": self.progress(&p.id, &r)?,
                    "stats": self.stats()?,
                }));
            }
        }
        if !self.allow_new(req) {
            return Response::error("Too many tickets", 429);
        }
        let id = ticket::new_id();
        let n = self.bump("visitors")?;
        let t = now();
        self.sql().exec(
            "INSERT INTO visitors (id, n, created, last_seen) VALUES (?, ?, ?, ?)",
            vec![id.as_str().into(), n.into(), t.into(), t.into()],
        )?;
        let r = self.row(&id)?.ok_or("ticket vanished")?;
        json(&serde_json::json!({
            "ticket": TicketOut { sig: ticket::sign(&key, &id, n), id: id.clone(), n },
            "returning": false,
            "progress": self.progress(&id, &r)?,
            "stats": self.stats()?,
        }))
    }

    /// A heartbeat, optionally carrying new events: credits the time watched, then judges the batch.
    fn sync(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<SyncReq>(body) else {
            return Response::error("Bad request", 400);
        };
        let Some(r) = self.check(&q.ticket)? else {
            return Response::error("Invalid ticket", 403);
        };
        let id = q.ticket.id.as_str();
        let t = now();
        // Time counts only while the page was on screen, and never more than one heartbeat's worth at once.
        let credit = if r.visible != 0 { (t - r.last_seen).clamp(0, MAX_CREDIT_MS) } else { 0 };
        let mut v = Visitor { watched_ms: r.watched + credit, last_seq: r.last_seq, found: self.found(id)? };
        let had = v.found.len();
        let mut events = q.events;
        events.truncate(MAX_BATCH);
        let out = judge::replay(&mut v, events);

        for e in &out.accepted {
            self.sql().exec(
                "INSERT OR IGNORE INTO events (visitor, seq, frame, at, received, watched) VALUES (?, ?, ?, ?, ?, ?)",
                vec![id.into(), e.seq.into(), e.id.as_str().into(), e.at.into(), t.into(), v.watched_ms.into()],
            )?;
        }
        if had == 0 && !v.found.is_empty() {
            self.bump("explorers")?;
        }
        let forged = r.forged != 0 || out.rejected.iter().any(|(_, x)| x.forged());
        let mut completion = r.completion;
        if completion.is_none() && v.found.len() == frames::total() {
            completion = Some(self.bump("completed")?);
            self.sql().exec(
                "UPDATE visitors SET completion = ?, completed_at = ? WHERE id = ?",
                vec![completion.into(), t.into(), id.into()],
            )?;
        }
        self.sql().exec(
            "UPDATE visitors SET last_seen = ?, visible = ?, watched = ?, last_seq = ?, forged = ? WHERE id = ?",
            vec![t.into(), (q.visible as i64).into(), v.watched_ms.into(), v.last_seq.into(), (forged as i64).into(), id.into()],
        )?;

        let rejected: Vec<Rejected> =
            out.rejected.iter().map(|(seq, x)| Rejected { seq: *seq, reason: x.as_str(), forged: x.forged() }).collect();
        json(&serde_json::json!({
            "accepted": out.accepted.iter().map(|e| e.seq).collect::<Vec<_>>(),
            "rejected": rejected,
            "progress": Progress { found: v.found, last_seq: v.last_seq, watched_ms: v.watched_ms, forged, completion },
            "inbox": self.inbox(r.n)?,
            "stats": self.stats()?,
        }))
    }
}
