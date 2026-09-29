//! The judge ("o fiscal"). Progress is never stored as a number: it is a log of
//! events, and this fold decides, event by event, which ones really happened.
//! Same idea as the event-sourced ledger: the balance is whatever the log
//! replays to, and a log that doesn't add up is refused, not patched.
//!
//! Pure on purpose (no Workers types), so it runs in `cargo test` on the host.

use crate::frames;
use serde::{Deserialize, Serialize};

/// What the judge knows about a visitor before the batch.
#[derive(Debug, Clone, Default)]
pub struct Visitor {
    /// Time actually spent on the site, credited by the server from heartbeats.
    pub watched_ms: i64,
    /// Highest event sequence number already seen: replays are idempotent.
    pub last_seq: i64,
    pub found: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Event {
    pub seq: i64,
    /// Frame id from frames.json.
    pub id: String,
    /// Client wall clock (ms), kept for the replay at the end; never trusted for judging.
    pub at: i64,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Reason {
    /// Not one of the 48.
    Unknown,
    /// One of the 48, but not built yet: nobody can have found it.
    Unbuilt,
    /// Found before the visitor could possibly have reached it: not refused,
    /// just not yet. The site keeps it and asks again later.
    TooSoon,
}

impl Reason {
    pub fn as_str(self) -> &'static str {
        match self {
            Reason::Unknown => "unknown",
            Reason::Unbuilt => "unbuilt",
            Reason::TooSoon => "too_soon",
        }
    }
    /// Invented rather than merely early: this stamps the ticket FALSIFICADO.
    pub fn forged(self) -> bool {
        matches!(self, Reason::Unknown | Reason::Unbuilt)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Accept,
    /// Already counted (a resend, or the same frame again): ignored, like an Idempotency-Key.
    Duplicate,
    Reject(Reason),
}

pub fn judge(v: &Visitor, e: &Event) -> Verdict {
    // A frame counts once: a resend, or the same frame found again, is a duplicate.
    if v.found.iter().any(|f| f == &e.id) {
        return Verdict::Duplicate;
    }
    let Some(frame) = frames::get(&e.id) else {
        return Verdict::Reject(Reason::Unknown);
    };
    if !frame.live {
        return Verdict::Reject(Reason::Unbuilt);
    }
    if v.watched_ms < frame.w * 1000 {
        return Verdict::Reject(Reason::TooSoon);
    }
    Verdict::Accept
}

pub struct Outcome {
    pub accepted: Vec<Event>,
    pub rejected: Vec<(i64, Reason)>,
}

/// Folds a batch over the visitor, in sequence order, updating it in place.
pub fn replay(v: &mut Visitor, mut events: Vec<Event>) -> Outcome {
    events.sort_by_key(|e| e.seq);
    let mut out = Outcome { accepted: vec![], rejected: vec![] };
    for e in events {
        match judge(v, &e) {
            Verdict::Accept => {
                v.found.push(e.id.clone());
                v.last_seq = e.seq;
                out.accepted.push(e);
            }
            Verdict::Duplicate => v.last_seq = v.last_seq.max(e.seq),
            Verdict::Reject(r) => {
                // A postponed event may still come back with this seq.
                if r != Reason::TooSoon {
                    v.last_seq = v.last_seq.max(e.seq);
                }
                out.rejected.push((e.seq, r));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(seq: i64, id: &str) -> Event {
        Event { seq, id: id.into(), at: 0 }
    }

    #[test]
    fn catalog_has_48_unique_frames() {
        assert_eq!(frames::total(), 48);
        let mut ids: Vec<_> = frames::all().iter().map(|f| f.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 48);
        assert!(frames::all().iter().enumerate().all(|(i, f)| f.n as usize == i + 1));
    }

    #[test]
    fn accepts_a_real_frame_once() {
        let mut v = Visitor { watched_ms: 60_000, ..Default::default() };
        let o = replay(&mut v, vec![ev(1, "spider"), ev(2, "spider")]);
        assert_eq!(o.accepted.len(), 1);
        assert!(o.rejected.is_empty());
        assert_eq!(v.found, vec!["spider"]);
        // Resending the same batch changes nothing.
        let o = replay(&mut v, vec![ev(1, "spider")]);
        assert!(o.accepted.is_empty() && o.rejected.is_empty());
    }

    #[test]
    fn invented_and_unbuilt_frames_are_forgeries() {
        let mut v = Visitor { watched_ms: 3_600_000, ..Default::default() };
        // Unbuilt: a frame that isn't live yet (once all 48 are, only the invented one is left).
        let unbuilt = crate::frames::all().iter().find(|f| !f.live).map(|f| f.id.as_str());
        let o = replay(&mut v, std::iter::once(ev(1, "admin")).chain(unbuilt.map(|id| ev(2, id))).collect());
        let mut want = vec![(1, Reason::Unknown)];
        if unbuilt.is_some() {
            want.push((2, Reason::Unbuilt));
        }
        assert_eq!(o.rejected, want);
        assert!(o.rejected.iter().all(|(_, r)| r.forged()));
        assert!(v.found.is_empty());
    }

    #[test]
    fn too_soon_waits_and_counts_later() {
        let mut v = Visitor { watched_ms: 4_000, ..Default::default() };
        let o = replay(&mut v, vec![ev(1, "duck"), ev(2, "spider")]);
        assert_eq!(o.rejected, vec![(1, Reason::TooSoon)]);
        assert!(!Reason::TooSoon.forged());
        // later, with enough time on the site, the same event is accepted
        v.watched_ms = 60_000;
        let o = replay(&mut v, vec![ev(1, "duck")]);
        assert_eq!(o.accepted.len(), 1);
        assert_eq!(v.found, vec!["spider", "duck"]);
    }
}
