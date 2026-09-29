//! A git smart-HTTP proxy for the site's `git` card (ROTEIRO §0.4.6, frame 44):
//! GitHub doesn't send CORS headers, so the browser's isomorphic-git talks to
//! GitHub through here. Only Gabriel's public repositories, only reads.

use worker::*;

const OWNER: &str = "Tech-GabrielLima/";

fn allowed(rest: &str) -> bool {
    let Some(repo) = rest.strip_prefix(OWNER) else { return false };
    let name = repo.split('/').next().unwrap_or("");
    let ok_name = !name.is_empty() && !name.starts_with('.') && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    // The two endpoints of a fetch (never receive-pack: nobody pushes through here).
    ok_name && (repo.ends_with("/info/refs") || repo.ends_with("/git-upload-pack"))
}

pub async fn proxy(mut req: Request, rest: &str) -> Result<Response> {
    if !allowed(rest) {
        return Response::error("Not a repository of the house", 403);
    }
    let url = req.url()?;
    let mut target = format!("https://github.com/{rest}");
    if let Some(q) = url.query() {
        // info/refs?service=git-upload-pack is the only query git sends.
        if q != "service=git-upload-pack" {
            return Response::error("Bad query", 400);
        }
        target.push('?');
        target.push_str(q);
    }
    let headers = Headers::new();
    for name in ["Content-Type", "Accept", "Git-Protocol"] {
        if let Some(v) = req.headers().get(name)? {
            headers.set(name, &v)?;
        }
    }
    headers.set("User-Agent", "git/isomorphic-git (sessao-noturna)")?;
    let mut init = RequestInit::new();
    init.with_method(req.method()).with_headers(headers);
    if req.method() == Method::Post {
        let body = req.bytes().await?;
        if body.len() > 64 * 1024 {
            return Response::error("Too large", 413);
        }
        init.with_body(Some(worker::js_sys::Uint8Array::from(body.as_slice()).into()));
    }
    let mut res = Fetch::Request(Request::new_with_init(&target, &init)?).send().await?;
    let status = res.status_code();
    let kind = res.headers().get("Content-Type")?.unwrap_or_default();
    let bytes = res.bytes().await?;
    let h = Headers::new();
    h.set("Content-Type", &kind)?;
    Ok(Response::from_bytes(bytes)?.with_status(status).with_headers(h))
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_the_house_and_only_fetches() {
        assert!(allowed("Tech-GabrielLima/gabriel-lima.git/info/refs"));
        assert!(allowed("Tech-GabrielLima/gabriel-lima.git/git-upload-pack"));
        assert!(!allowed("Tech-GabrielLima/gabriel-lima.git/git-receive-pack"));
        assert!(!allowed("someone/else.git/info/refs"));
        assert!(!allowed("Tech-GabrielLima/../x/info/refs"));
        assert!(!allowed("Tech-GabrielLima//info/refs"));
    }
}
