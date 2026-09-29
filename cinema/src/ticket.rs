//! The visitor's ticket: a random id plus a sequential number, signed so the
//! site can't be handed somebody else's (or a made-up) ticket. No names, no
//! e-mail, no IP: the ticket is the whole identity.

use hmac::{Hmac, Mac};
use sha2::Sha256;

pub fn new_id() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("randomness");
    hex(&b)
}

pub fn sign(key: &str, id: &str, n: i64) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("any key length");
    mac.update(format!("ticket.v1.{id}.{n}").as_bytes());
    hex(&mac.finalize().into_bytes()[..16])
}

/// Constant-time compare, so the signature can't be guessed byte by byte.
pub fn verify(key: &str, id: &str, n: i64, sig: &str) -> bool {
    let good = sign(key, id, n);
    good.len() == sig.len() && good.bytes().zip(sig.bytes()).fold(0u8, |a, (x, y)| a | (x ^ y)) == 0
}

/// HMAC-SHA256 of a message (the certificate's signature).
pub fn mac(key: &str, msg: &str) -> Vec<u8> {
    let mut m = Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("any key length");
    m.update(msg.as_bytes());
    m.finalize().into_bytes().to_vec()
}

/// Crockford-style base32, for codes people type (no I, L, O, U).
pub fn base32(b: &[u8]) -> String {
    const A: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut bits = 0u32;
    let mut n = 0;
    let mut out = String::new();
    for &x in b {
        bits = (bits << 8) | x as u32;
        n += 8;
        while n >= 5 {
            n -= 5;
            out.push(A[((bits >> n) & 31) as usize] as char);
        }
    }
    if n > 0 {
        out.push(A[((bits << (5 - n)) & 31) as usize] as char);
    }
    out
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signatures_bind_id_and_number() {
        let s = sign("k", "abc", 7);
        assert!(verify("k", "abc", 7, &s));
        assert!(!verify("k", "abc", 8, &s));
        assert!(!verify("other", "abc", 7, &s));
        assert_eq!(new_id().len(), 32);
        assert_eq!(base32(&[0xFF; 5]), "ZZZZZZZZ");
        assert_eq!(base32(&mac("k", "x")[..5]).len(), 8);
    }
}
