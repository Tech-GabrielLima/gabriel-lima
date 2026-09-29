//! The 48 lost frames (ROTEIRO §0.4), read from the same frames.json the site imports.

use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Deserialize, Debug)]
/// `n` and `act` are read by the site (and the tests); the judge only needs the rest.
#[allow(dead_code)]
pub struct Frame {
    pub n: u32,
    pub id: String,
    pub act: u8,
    /// Seconds the visitor must have spent on the site before this frame can be found.
    pub w: i64,
    /// Built: frames that don't exist yet can't be found, so claiming one is a forgery.
    pub live: bool,
}

#[derive(Deserialize)]
struct Catalog {
    frames: Vec<Frame>,
}

pub fn all() -> &'static [Frame] {
    static FRAMES: OnceLock<Vec<Frame>> = OnceLock::new();
    FRAMES.get_or_init(|| {
        serde_json::from_str::<Catalog>(include_str!("../frames.json"))
            .expect("frames.json")
            .frames
    })
}

pub fn get(id: &str) -> Option<&'static Frame> {
    all().iter().find(|f| f.id == id)
}

pub fn total() -> usize {
    all().len()
}

pub fn built() -> usize {
    all().iter().filter(|f| f.live).count()
}
