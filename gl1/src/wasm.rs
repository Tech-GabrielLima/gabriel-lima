//! The GL-1 as a WebAssembly module, over the plain C ABI (no glue): the
//! site's host (src/gl1/ in the site) creates machines by handle, runs them a
//! frame at a time, types into them, and drains their console, mailbox and
//! expansion bus. Byte results land in each machine's `out` buffer: a call
//! returns the length, `gl1_out` the address.

use crate::glfs::LiveFs;
use crate::machine::{Machine, Power};
use std::cell::RefCell;

struct Slot {
    m: Machine,
    out: Vec<u8>,
}

thread_local! {
    static MACHINES: RefCell<Vec<Option<Slot>>> = const { RefCell::new(Vec::new()) };
    static SCRATCH: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn with<R>(h: u32, f: impl FnOnce(&mut Slot) -> R) -> Option<R> {
    MACHINES.with(|ms| ms.borrow_mut().get_mut(h as usize).and_then(|s| s.as_mut()).map(f))
}

unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(ptr, len)
    }
}

/// Memory for the host to write into (freed with gl1_free).
#[no_mangle]
pub extern "C" fn gl1_alloc(len: usize) -> *mut u8 {
    let mut v = vec![0u8; len.max(1)];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from gl1_alloc with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn gl1_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, len.max(1), len.max(1)));
}

/// A new machine from a ROM and a disk image → its handle.
///
/// # Safety
/// The pointers must point at `*_len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_new(rom: *const u8, rom_len: usize, disk: *const u8, disk_len: usize, user: u8, lang: u8) -> u32 {
    let mut m = Machine::new(bytes(rom, rom_len), bytes(disk, disk_len).to_vec());
    m.boot_user = user;
    m.lang = lang;
    m.reset();
    MACHINES.with(|ms| {
        let mut ms = ms.borrow_mut();
        ms.push(Some(Slot { m, out: vec![] }));
        (ms.len() - 1) as u32
    })
}

#[no_mangle]
pub extern "C" fn gl1_drop(h: u32) {
    MACHINES.with(|ms| {
        if let Some(s) = ms.borrow_mut().get_mut(h as usize) {
            *s = None
        }
    });
}

/// Where the last byte result is.
#[no_mangle]
pub extern "C" fn gl1_out(h: u32) -> *const u8 {
    with(h, |s| s.out.as_ptr()).unwrap_or(std::ptr::null())
}

/// Runs `ms` of emulated time → the cycles it took.
#[no_mangle]
pub extern "C" fn gl1_run(h: u32, ms: f64) -> f64 {
    with(h, |s| s.m.run(ms) as f64).unwrap_or(0.0)
}

#[no_mangle]
pub extern "C" fn gl1_key(h: u32, b: u8) {
    with(h, |s| s.m.key(b));
}

#[no_mangle]
pub extern "C" fn gl1_set_size(h: u32, cols: u8, rows: u8) {
    with(h, |s| {
        s.m.cols = cols;
        s.m.rows = rows
    });
}

#[no_mangle]
pub extern "C" fn gl1_set_time(h: u32, unix: f64) {
    with(h, |s| s.m.unix_time = unix as u64);
}

#[no_mangle]
pub extern "C" fn gl1_set_lang(h: u32, lang: u8) {
    with(h, |s| s.m.lang = lang);
}

#[no_mangle]
pub extern "C" fn gl1_set_pad(h: u32, pad: u8) {
    with(h, |s| s.m.pad = pad);
}

#[no_mangle]
pub extern "C" fn gl1_tone(h: u32) -> u8 {
    with(h, |s| s.m.tone).unwrap_or(0)
}

/// Which card ids answer on the bus (bit per id).
#[no_mangle]
pub extern "C" fn gl1_set_cards(h: u32, mask: u32) {
    with(h, |s| s.m.card.installed = mask as u64);
}

/// 0 on, 1 off, 2 wants a reboot, 3 panicked.
#[no_mangle]
pub extern "C" fn gl1_power(h: u32) -> u8 {
    with(h, |s| match s.m.power {
        Power::On => 0,
        Power::Off => 1,
        Power::Reboot => 2,
        Power::Panic => 3,
    })
    .unwrap_or(1)
}

#[no_mangle]
pub extern "C" fn gl1_reset(h: u32) {
    with(h, |s| s.m.reset());
}

/// Throws away every write since the disk was loaded (copy-on-write).
#[no_mangle]
pub extern "C" fn gl1_revert(h: u32) {
    with(h, |s| {
        s.m.disk.overlay.clear();
        s.m.disk.changed = true
    });
}

/// Console output since the last call → length (bytes in gl1_out).
#[no_mangle]
pub extern "C" fn gl1_take_console(h: u32) -> usize {
    with(h, |s| {
        s.out = s.m.take_console();
        s.out.len()
    })
    .unwrap_or(0)
}

/// The next mailbox message → its length, or -1.
#[no_mangle]
pub extern "C" fn gl1_take_message(h: u32) -> i32 {
    with(h, |s| match s.m.take_message() {
        Some(m) => {
            s.out = m;
            s.out.len() as i32
        }
        None => -1,
    })
    .unwrap_or(-1)
}

/// # Safety
/// `ptr` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_reply(h: u32, ptr: *const u8, len: usize) {
    let b = bytes(ptr, len).to_vec();
    with(h, |s| s.m.reply(&b));
}

/// The next expansion-card command → its length (card id in the first byte), or -1.
#[no_mangle]
pub extern "C" fn gl1_take_card(h: u32) -> i32 {
    with(h, |s| match s.m.take_card_request() {
        Some((id, cmd)) => {
            s.out = std::iter::once(id).chain(cmd).collect();
            s.out.len() as i32
        }
        None => -1,
    })
    .unwrap_or(-1)
}

/// # Safety
/// `ptr` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_card_output(h: u32, ptr: *const u8, len: usize) {
    let b = bytes(ptr, len).to_vec();
    with(h, |s| s.m.card_output(&b));
}

/// What the machine sent the running card (keys, piped stdin) → length.
#[no_mangle]
pub extern "C" fn gl1_card_input(h: u32) -> usize {
    with(h, |s| {
        s.out = s.m.card_take_input();
        s.out.len()
    })
    .unwrap_or(0)
}

/// 1 once the machine has sent all of the card's stdin.
#[no_mangle]
pub extern "C" fn gl1_card_input_closed(h: u32) -> u8 {
    with(h, |s| s.m.card.input_closed as u8).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn gl1_card_interrupt(h: u32) -> u8 {
    with(h, |s| s.m.card_take_interrupt() as u8).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn gl1_card_finish(h: u32, code: u8) {
    with(h, |s| s.m.card_finish(code));
}

#[no_mangle]
pub extern "C" fn gl1_display_mode(h: u32) -> u8 {
    with(h, |s| s.m.display_mode).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn gl1_frames(h: u32) -> u32 {
    with(h, |s| s.m.frames).unwrap_or(0)
}

/// The whole 64 KB address space, for VRAM and for looking inside (X-ray, debugger).
#[no_mangle]
pub extern "C" fn gl1_mem(h: u32) -> *const u8 {
    with(h, |s| s.m.mem.as_ptr()).unwrap_or(std::ptr::null())
}

/// Registers → 16 bytes in gl1_out: A B C D, X Y SP PC (little-endian words), F, halted.
#[no_mangle]
pub extern "C" fn gl1_regs(h: u32) -> usize {
    with(h, |s| {
        let c = &s.m.cpu;
        let mut o = vec![c.r[0], c.r[1], c.r[2], c.r[3]];
        for w in [c.x, c.y, c.sp, c.pc] {
            o.extend_from_slice(&w.to_le_bytes());
        }
        o.push(c.f);
        o.push(c.halted as u8);
        o.extend_from_slice(&[0, 0]);
        s.out = o;
        s.out.len()
    })
    .unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn gl1_instructions(h: u32) -> f64 {
    with(h, |s| s.m.cpu.instructions as f64).unwrap_or(0.0)
}

/// A file of the machine's disk → its length (bytes in gl1_out), or -1.
///
/// # Safety
/// `path` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_fs_read(h: u32, path: *const u8, len: usize) -> i32 {
    let p = String::from_utf8_lossy(bytes(path, len)).to_string();
    with(h, |s| match (LiveFs { disk: &mut s.m.disk }).read(&p) {
        Some(d) => {
            s.out = d;
            s.out.len() as i32
        }
        None => -1,
    })
    .unwrap_or(-1)
}

/// Writes a file on the machine's disk → 0, or -1 (the reason in gl1_out).
///
/// # Safety
/// The pointers must point at their lengths of readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_fs_write(h: u32, path: *const u8, plen: usize, data: *const u8, dlen: usize, owner: u8, mode: u8) -> i32 {
    let p = String::from_utf8_lossy(bytes(path, plen)).to_string();
    let d = bytes(data, dlen).to_vec();
    with(h, |s| match (LiveFs { disk: &mut s.m.disk }).write(&p, &d, owner, mode) {
        Ok(()) => 0,
        Err(e) => {
            s.out = e.into_bytes();
            -1
        }
    })
    .unwrap_or(-1)
}

/// `glasm` in the browser: assembles a source → a GLX (or raw bytes), or the errors.
/// Returns the length (positive: the program, negative: error text) in the scratch buffer.
///
/// # Safety
/// `src` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_assemble(src: *const u8, len: usize) -> i32 {
    let text = String::from_utf8_lossy(bytes(src, len)).to_string();
    // The same includes GL-OS programs use, built in.
    let resolve = |name: &str| -> Option<String> {
        Some(
            match name {
                "inc/gl1.inc" => include_str!("../os/inc/gl1.inc"),
                "lib/libgl.s" => include_str!("../os/lib/libgl.s"),
                "lib/host.s" => include_str!("../os/lib/host.s"),
                "lib/fmt.s" => include_str!("../os/lib/fmt.s"),
                "lib/user.s" => include_str!("../os/lib/user.s"),
                "lib/procs.s" => include_str!("../os/lib/procs.s"),
                _ => return None,
            }
            .to_string(),
        )
    };
    let (out, ok) = match crate::asm::assemble("program.s", &text, &resolve) {
        Ok(p) => (if p.relocatable { crate::glx::from_program(&p) } else { p.bytes }, true),
        Err(e) => (e.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n").into_bytes(), false),
    };
    SCRATCH.with(|s| {
        let n = out.len() as i32;
        *s.borrow_mut() = out;
        if ok {
            n
        } else {
            -n
        }
    })
}

#[no_mangle]
pub extern "C" fn gl1_scratch() -> *const u8 {
    SCRATCH.with(|s| s.borrow().as_ptr())
}

/// Every sector written since the disk was loaded → length: [sector u16][512 bytes]...
#[no_mangle]
pub extern "C" fn gl1_overlay_export(h: u32) -> usize {
    with(h, |s| {
        let mut keys: Vec<_> = s.m.disk.overlay.keys().copied().collect();
        keys.sort();
        let mut o = Vec::with_capacity(keys.len() * 514);
        for k in keys {
            o.extend_from_slice(&k.to_le_bytes());
            o.extend_from_slice(&s.m.disk.overlay[&k]);
        }
        s.out = o;
        s.out.len()
    })
    .unwrap_or(0)
}

/// Puts back what gl1_overlay_export gave (another terminal's writes, or last visit's).
///
/// # Safety
/// `ptr` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_overlay_import(h: u32, ptr: *const u8, len: usize) {
    let b = bytes(ptr, len).to_vec();
    with(h, |s| {
        for c in b.chunks_exact(514) {
            let sec = u16::from_le_bytes([c[0], c[1]]);
            s.m.disk.write(sec, &c[2..]);
        }
        s.m.disk.changed = true;
    });
}

/// A directory of the machine's disk → "name\tkind\tsize\n" lines (kind: 1 file, 2 dir, 3 device), or -1.
///
/// # Safety
/// `path` must point at `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn gl1_fs_list(h: u32, path: *const u8, len: usize) -> i32 {
    let p = String::from_utf8_lossy(bytes(path, len)).to_string();
    with(h, |s| match (LiveFs { disk: &mut s.m.disk }).list(&p) {
        Some(items) => {
            s.out = items.iter().map(|i| format!("{}\t{}\t{}\n", i.name, i.kind, i.size)).collect::<String>().into_bytes();
            s.out.len() as i32
        }
        None => -1,
    })
    .unwrap_or(-1)
}
