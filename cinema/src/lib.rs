//! Sessão Noturna · the cinema's memory (ROTEIRO §0.4.3).
//!
//! A Cloudflare Worker in front of one Durable Object with SQLite: it numbers
//! every visitor, keeps the event log of the 48 lost frames, judges it, and
//! counts the night (visitors, explorers, completions). The site talks to it
//! with plain-text POSTs, so there is no CORS preflight and a beacon on the way
//! out still arrives.

mod cinema;
mod git;
mod frames;
mod judge;
mod social;
mod vocab;
mod ticket;

use worker::*;

fn cors(req: &Request, env: &Env, mut res: Response) -> Result<Response> {
    let origin = req.headers().get("Origin")?.unwrap_or_default();
    let allowed = env.var("ALLOWED_ORIGINS").map(|v| v.to_string()).unwrap_or_default();
    let h = res.headers_mut();
    if allowed.split(',').any(|o| o.trim() == origin) {
        h.set("Access-Control-Allow-Origin", &origin)?;
        h.set("Vary", "Origin")?;
        h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")?;
        h.set("Access-Control-Allow-Headers", "Content-Type, Git-Protocol, Accept")?;
        h.set("Access-Control-Max-Age", "86400")?;
    }
    h.set("Cache-Control", "no-store")?;
    Ok(res)
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    let res = if req.method() == Method::Options {
        Response::empty()?
    } else if path == "/v1/health" {
        Response::ok("ok")?
    } else if matches!(path.as_str(), "/v1/visit" | "/v1/sync" | "/v1/stats" | "/v1/count" | "/v1/counts" | "/v1/stubs" | "/v1/online" | "/v1/write" | "/v1/completions" | "/v1/film" | "/v1/certificate" | "/v1/verify" | "/v1/notes"){
        let stub = env.durable_object("CINEMA")?.get_by_name("main")?;
        let inner = stub.fetch_with_request(req.clone()?).await?;
        // Rebuilt so its headers are ours to set.
        let status = inner.status_code();
        let mut inner = inner;
        let text = inner.text().await?;
        Response::ok(text)?.with_status(status).with_headers({
            let h = Headers::new();
            h.set("Content-Type", "application/json")?;
            h
        })
    } else if let Some(rest) = path.strip_prefix("/git/") {
        git::proxy(req.clone()?, rest).await?
    } else {
        Response::error("Not found", 404)?
    };
    cors(&req, &env, res)
}
