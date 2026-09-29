//! The house's other visitors (ROTEIRO §0.4.6, §0.4.8): who's online, notes
//! passed between them in the house vocabulary, the list of completions (the
//! mural), the collective film, the signed certificate and the notes left for
//! the next visitor in Cabin 0.

use crate::cinema::{json, now, Cinema, Pass, V};
use crate::{ticket, vocab};
use serde::{Deserialize, Serialize};
use worker::*;

/// Seen within this long, with the page on screen: online.
const ONLINE_MS: i64 = 45_000;
const WRITE_COOLDOWN_MS: i64 = 10_000;

#[derive(Deserialize)]
struct WriteReq {
    ticket: Pass,
    to: i64,
    words: Vec<String>,
}

#[derive(Deserialize)]
struct TicketReq {
    ticket: Pass,
}

#[derive(Deserialize)]
struct VerifyReq {
    claim: String,
    sig: String,
}

#[derive(Deserialize)]
struct NoteReq {
    ticket: Pass,
    words: Vec<String>,
}

/// A frame of the collective film: where the visitor was, not a picture (so there's nothing to moderate).
#[derive(Deserialize, Serialize, Clone)]
struct FilmFrame {
    /// 1 lobby, 2 film, 3 lights up
    act: u8,
    /// Film time in seconds (0 when not in the film).
    t: f64,
    /// The light, in -1..1.
    x: f64,
    y: f64,
    /// A palette index (0..7).
    c: u8,
}

#[derive(Deserialize)]
struct FilmReq {
    ticket: Pass,
    frame: FilmFrame,
}

#[derive(Deserialize, Serialize)]
struct N {
    n: i64,
}

#[derive(Deserialize, Serialize)]
struct Msg {
    from_n: i64,
    text: String,
    at: i64,
}

#[derive(Deserialize, Serialize)]
struct Completion {
    completion: i64,
    n: i64,
    ms: i64,
    at: i64,
}

#[derive(Deserialize)]
struct FilmRow {
    n: i64,
    completion: i64,
    frame: String,
}

#[derive(Deserialize, Serialize)]
struct NoteRow {
    n: i64,
    text: String,
    at: i64,
}

impl Cinema {
    pub(crate) fn online(&self) -> Result<serde_json::Value> {
        let rows: Vec<N> = self
            .sql()
            .exec("SELECT n FROM visitors WHERE last_seen > ? AND visible = 1 ORDER BY n DESC LIMIT 50", vec![(now() - ONLINE_MS).into()])?
            .to_array()?;
        Ok(serde_json::json!({ "online": rows.iter().map(|r| r.n).collect::<Vec<_>>() }))
    }

    /// `write #N words…` from GL-OS: a note to someone online, in the house vocabulary.
    pub(crate) fn write(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<WriteReq>(body) else { return Response::error("Bad request", 400) };
        let Some(me) = self.check(&q.ticket)? else { return Response::error("Invalid ticket", 403) };
        let Some(text) = vocab::sentence(&q.words) else { return Response::error("Not in the house vocabulary", 422) };
        let t = now();
        {
            let mut w = self.wrote.borrow_mut();
            if w.get(&me.n).is_some_and(|at| t - at < WRITE_COOLDOWN_MS) {
                return Response::error("Too soon", 429);
            }
            w.insert(me.n, t);
        }
        let there: Vec<N> = self
            .sql()
            .exec("SELECT n FROM visitors WHERE n = ? AND last_seen > ?", vec![q.to.into(), (t - ONLINE_MS).into()])?
            .to_array()?;
        if there.is_empty() {
            return Response::error("Not online", 404);
        }
        self.sql().exec("INSERT INTO inbox (to_n, from_n, text, at) VALUES (?, ?, ?, ?)", vec![q.to.into(), me.n.into(), text.as_str().into(), t.into()])?;
        json(&serde_json::json!({ "sent": text }))
    }

    /// Notes waiting for visitor `n` (they're delivered once, with its next heartbeat).
    pub(crate) fn inbox(&self, n: i64) -> Result<Vec<serde_json::Value>> {
        let rows: Vec<Msg> = self.sql().exec("SELECT from_n, text, at FROM inbox WHERE to_n = ? AND read = 0 ORDER BY id LIMIT 10", vec![n.into()])?.to_array()?;
        if !rows.is_empty() {
            self.sql().exec("UPDATE inbox SET read = 1 WHERE to_n = ?", vec![n.into()])?;
        }
        Ok(rows.into_iter().map(|m| serde_json::json!(m)).collect())
    }

    /// The mural: every completion, in order.
    pub(crate) fn completions(&self) -> Result<serde_json::Value> {
        let rows: Vec<Completion> = self
            .sql()
            .exec("SELECT completion, n, completed_at - created AS ms, completed_at AS at FROM visitors WHERE completion IS NOT NULL ORDER BY completion LIMIT 500", None)?
            .to_array()?;
        let avg: V = self.sql().exec("SELECT CAST(AVG(completed_at - created) AS INTEGER) AS v FROM visitors WHERE completion IS NOT NULL", None)?.one()?;
        Ok(serde_json::json!({ "completions": rows, "avg_ms": avg.v }))
    }

    fn completed(&self, p: &Pass) -> Result<std::result::Result<(i64, i64), Response>> {
        let Some(r) = self.check(p)? else { return Ok(Err(Response::error("Invalid ticket", 403)?)) };
        let Some(c) = r.completion else { return Ok(Err(Response::error("Not completed", 403)?)) };
        Ok(Ok((r.n, c)))
    }

    pub(crate) fn film_add(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<FilmReq>(body) else { return Response::error("Bad request", 400) };
        let (n, c) = match self.completed(&q.ticket)? {
            Ok(v) => v,
            Err(r) => return Ok(r),
        };
        let f = q.frame;
        if !(1..=3).contains(&f.act) || !(0.0..=300.0).contains(&f.t) || !(-1.0..=1.0).contains(&f.x) || !(-1.0..=1.0).contains(&f.y) || f.c > 7 {
            return Response::error("Bad frame", 422);
        }
        let s = serde_json::to_string(&f)?;
        let done: Vec<N> = self.sql().exec("SELECT n FROM collective WHERE n = ?", vec![n.into()])?.to_array()?;
        if !done.is_empty() {
            return Response::error("One frame per ticket", 409);
        }
        self.sql().exec("INSERT INTO collective (n, completion, frame, at) VALUES (?, ?, ?, ?)", vec![n.into(), c.into(), s.as_str().into(), now().into()])?;
        json(&serde_json::json!({ "frame": c }))
    }

    pub(crate) fn film(&self) -> Result<serde_json::Value> {
        let rows: Vec<FilmRow> = self.sql().exec("SELECT n, completion, frame FROM collective ORDER BY completion", None)?.to_array()?;
        let frames: Vec<serde_json::Value> = rows
            .into_iter()
            .filter_map(|r| serde_json::from_str::<FilmFrame>(&r.frame).ok().map(|f| serde_json::json!({ "n": r.n, "completion": r.completion, "frame": f })))
            .collect();
        Ok(serde_json::json!({ "frames": frames }))
    }

    /// The signed ticket: who finished, as which completion, in how long. Anyone with the key can check it.
    pub(crate) fn certificate(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<TicketReq>(body) else { return Response::error("Bad request", 400) };
        let (n, c) = match self.completed(&q.ticket)? {
            Ok(v) => v,
            Err(r) => return Ok(r),
        };
        let row: V = self.sql().exec("SELECT completed_at - created AS v FROM visitors WHERE n = ?", vec![n.into()])?.one()?;
        let ms = row.v.unwrap_or(0);
        let claim = format!("sessao-noturna.certificate.v1|explorer={n}|completion={c}|ms={ms}|frames=48");
        let key = self.key()?;
        let sig = ticket::mac(&key, &claim);
        // A short code a person can type in an e-mail: 8 characters of base32 from the signature.
        let code = ticket::base32(&sig[..5]);
        json(&serde_json::json!({ "claim": claim, "explorer": n, "completion": c, "ms": ms, "frames": 48, "sig": ticket::hex(&sig), "code": code, "alg": "HMAC-SHA256" }))
    }

    /// Checks a signed ticket (the hall-of-explorers CI calls this): the signature, and that the claim matches the house's records.
    pub(crate) fn verify(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<VerifyReq>(body) else { return Response::error("Bad request", 400) };
        let key = self.key()?;
        let signed = ticket::hex(&ticket::mac(&key, &q.claim)) == q.sig.to_ascii_lowercase();
        let field = |k: &str| q.claim.split('|').find_map(|p| p.strip_prefix(k)).and_then(|v| v.parse::<i64>().ok());
        let (Some(n), Some(c), Some(ms)) = (field("explorer="), field("completion="), field("ms=")) else {
            return json(&serde_json::json!({ "valid": false, "why": "malformed claim" }));
        };
        let rows: Vec<Completion> = self
            .sql()
            .exec("SELECT completion, n, completed_at - created AS ms, completed_at AS at FROM visitors WHERE n = ? AND completion = ?", vec![n.into(), c.into()])?
            .to_array()?;
        let recorded = rows.first().is_some_and(|r| r.ms == ms);
        let valid = signed && recorded && q.claim.starts_with("sessao-noturna.certificate.v1|");
        json(&serde_json::json!({ "valid": valid, "explorer": n, "completion": c, "ms": ms, "why": if valid { "" } else if !signed { "bad signature" } else { "not in the records" } }))
    }

    pub(crate) fn note_add(&self, body: &str) -> Result<Response> {
        let Ok(q) = serde_json::from_str::<NoteReq>(body) else { return Response::error("Bad request", 400) };
        let (n, _) = match self.completed(&q.ticket)? {
            Ok(v) => v,
            Err(r) => return Ok(r),
        };
        let Some(text) = vocab::sentence(&q.words) else { return Response::error("Not in the house vocabulary", 422) };
        self.sql().exec("INSERT OR REPLACE INTO leftnotes (n, text, at) VALUES (?, ?, ?)", vec![n.into(), text.as_str().into(), now().into()])?;
        json(&serde_json::json!({ "note": text }))
    }

    pub(crate) fn notes(&self) -> Result<serde_json::Value> {
        let rows: Vec<NoteRow> = self.sql().exec("SELECT n, text, at FROM leftnotes ORDER BY at DESC LIMIT 30", None)?.to_array()?;
        Ok(serde_json::json!({ "notes": rows }))
    }
}
