//! GLX, the GL-OS executable: a relocatable program the kernel can load at
//! any address.
//!
//! ```text
//! 0  "GLX1"
//! 4  code size   u16
//! 6  bss size    u16   (zeroed after the code)
//! 8  entry       u16   (offset of `start`, else 0)
//! 10 relocs      u16   (count)
//! 12 stack       u16   (bytes the program wants for its stack; 0 = default)
//! 14 reserved    u16
//! 16 code…
//! .. relocs…     u16 each: offset of a 16-bit field to add the load address to
//! ```

use crate::asm::Program;

pub const MAGIC: &[u8; 4] = b"GLX1";
pub const HEADER: usize = 16;

pub fn from_program(p: &Program) -> Vec<u8> {
    let entry = p.symbols.get("start").copied().unwrap_or(0);
    let stack = p.symbols.get("STACK").copied().unwrap_or(0);
    let mut out = Vec::with_capacity(HEADER + p.bytes.len() + p.relocs.len() * 2);
    out.extend_from_slice(MAGIC);
    for v in [p.bytes.len() as u16, p.bss, entry, p.relocs.len() as u16, stack, 0] {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out.extend_from_slice(&p.bytes);
    for r in &p.relocs {
        out.extend_from_slice(&r.to_le_bytes());
    }
    out
}

/// What the kernel's loader does, in Rust: for tests and for the CLI's `run`.
pub fn load(glx: &[u8], base: u16, mem: &mut [u8]) -> Option<u16> {
    if glx.len() < HEADER || &glx[..4] != MAGIC {
        return None;
    }
    let w = |i: usize| u16::from_le_bytes([glx[i], glx[i + 1]]);
    let (size, bss, entry, n) = (w(4) as usize, w(6) as usize, w(8), w(10) as usize);
    let code = glx.get(HEADER..HEADER + size)?;
    let b = base as usize;
    mem.get_mut(b..b + size)?.copy_from_slice(code);
    mem.get_mut(b + size..b + size + bss)?.fill(0);
    for i in 0..n {
        let at = b + w(HEADER + size + 2 * i) as usize;
        let v = u16::from_le_bytes([mem[at], mem[at + 1]]).wrapping_add(base);
        mem[at..at + 2].copy_from_slice(&v.to_le_bytes());
    }
    Some(base.wrapping_add(entry))
}
