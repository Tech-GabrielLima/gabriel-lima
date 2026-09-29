//! Builds GL-OS from its sources: the ROM, the kernel, every program, and the
//! disk image that holds them. Used by the CLI (`gl1 build`) and by the tests,
//! which boot the result.
//!
//! ```text
//! os/rom.s             → ROM (4 KB at $F000)
//! os/kernel.s          → /boot/kernel.sys (absolute, at $0400)
//! os/bin/*.s           → /bin/<name>   (GLX)
//! os/sbin/*.s          → /sbin/<name>  (GLX)
//! os/root/**           → copied as-is
//! os/fs.txt            → owners, modes, devices, aliases (see that file)
//! extra roots          → copied over os/root (generated content: the portfolio)
//! ```

use crate::asm::{self, Program};
use crate::glfs::{self, Entry};
use crate::glx;
use std::path::{Path, PathBuf};

pub const DISK_SECTORS: u16 = 8192; // 4 MB

#[derive(Debug)]
pub struct BuildError(pub String);

impl From<std::io::Error> for BuildError {
    fn from(e: std::io::Error) -> Self {
        BuildError(e.to_string())
    }
}

pub struct Os {
    pub rom: Vec<u8>,
    pub kernel: Program,
    pub disk: Vec<u8>,
    /// Every program, for listings and the debugger.
    pub programs: Vec<(String, Program)>,
}

pub fn assemble_file(path: &Path, include: &Path) -> Result<Program, BuildError> {
    let src = std::fs::read_to_string(path).map_err(|e| BuildError(format!("{}: {e}", path.display())))?;
    let dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
    let inc = include.to_path_buf();
    let resolve = move |name: &str| -> Option<String> {
        for base in [&dir, &inc] {
            if let Ok(s) = std::fs::read_to_string(base.join(name)) {
                return Some(s);
            }
        }
        None
    };
    asm::assemble(&path.display().to_string(), &src, &resolve).map_err(|errs| BuildError(errs.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n")))
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut items: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    items.sort();
    for p in items {
        if p.is_dir() {
            walk(&p, out)
        } else {
            out.push(p)
        }
    }
}

fn sources(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir).map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "s")).collect()).unwrap_or_default();
    v.sort();
    v
}

pub fn build(os: &Path, extra_roots: &[PathBuf]) -> Result<Os, BuildError> {
    let inc = os.to_path_buf();
    let rom = assemble_file(&os.join("rom.s"), &inc)?;
    if rom.org != 0xF000 || rom.bytes.len() > 0x1000 {
        return Err(BuildError(format!("rom must sit at $F000 and fit 4 KB (org ${:04X}, {} bytes)", rom.org, rom.bytes.len())));
    }
    let mut rom_bytes = rom.bytes.clone();
    rom_bytes.resize(0x1000, 0);
    let kernel = assemble_file(&os.join("kernel.s"), &inc)?;
    if kernel.org != 0x0400 || kernel.bytes.len() > 0x3000 - 0x0400 {
        return Err(BuildError(format!("kernel must sit at $0400 and end before $3000 ({} bytes)", kernel.bytes.len())));
    }
    let kentry = kernel.symbols.get("kmain").copied().unwrap_or(0x0400);

    let mut entries: Vec<Entry> = vec![];
    let mut programs = vec![];
    for (dir, at) in [("bin", "/bin"), ("sbin", "/sbin"), ("caixa", "/opt/caixa/bin"), ("games", "/usr/games")] {
        for src in sources(&os.join(dir)) {
            let p = assemble_file(&src, &inc)?;
            if !p.relocatable {
                return Err(BuildError(format!("{}: programs must be .relocatable", src.display())));
            }
            // The kernel loads code + bss + stack below the argument line of a 4 KB slot.
            let stack = p.symbols.get("STACK").copied().unwrap_or(512) as usize;
            let need = p.bytes.len() + p.bss as usize + stack;
            if need > 0x0F80 - 11 {
                return Err(BuildError(format!("{}: {} bytes with its stack, a slot holds {}", src.display(), need, 0x0F80 - 11)));
            }
            let name = src.file_stem().unwrap().to_string_lossy().to_string();
            entries.push(Entry { path: format!("{at}/{name}"), kind: glfs::kind::FILE, owner: glfs::ROOT, mode: glfs::mode::READ | glfs::mode::EXEC, data: glx::from_program(&p) });
            programs.push((format!("{at}/{name}"), p));
        }
    }
    let mut roots = vec![os.join("root")];
    roots.extend(extra_roots.iter().cloned());
    for root in &roots {
        let mut files = vec![];
        walk(root, &mut files);
        for f in files {
            let rel = f.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            if rel.ends_with(".keep") {
                // An empty directory.
                let dir = rel.trim_end_matches(".keep").trim_end_matches('/');
                entries.push(Entry { path: format!("/{dir}/.keep"), kind: glfs::kind::FILE, owner: glfs::ROOT, mode: glfs::mode::HIDDEN | glfs::mode::READ, data: vec![] });
                continue;
            }
            entries.push(Entry { path: format!("/{rel}"), kind: glfs::kind::FILE, owner: glfs::ROOT, mode: glfs::mode::READ, data: std::fs::read(&f)? });
        }
    }
    apply_fs_txt(&os.join("fs.txt"), &mut entries)?;
    let disk = glfs::mkfs(&entries, &kernel.bytes, kernel.org, kentry, DISK_SECTORS, "GL-OS").map_err(|e| BuildError(e.0))?;
    Ok(Os { rom: rom_bytes, kernel, disk, programs })
}

/// fs.txt, one rule per line:
///   own  <path-prefix> <uid> <mode>    owner and mode of everything under a prefix
///   dev  <path> <mode>                 a device file (the host answers for it)
///   dir  <path> <uid> <mode>           a directory (created if missing) with its owner and mode
///   alias <path> <existing>            the same bytes under another name
///   exec <path>                        make a file executable (generated programs)
fn apply_fs_txt(path: &Path, entries: &mut Vec<Entry>) -> Result<(), BuildError> {
    let Ok(text) = std::fs::read_to_string(path) else { return Ok(()) };
    let num = |s: &str| -> Result<u8, BuildError> { s.parse::<u8>().map_err(|_| BuildError(format!("fs.txt: bad number {s}"))) };
    for (i, line) in text.lines().enumerate() {
        let line = line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let w: Vec<&str> = line.split_whitespace().collect();
        match w.as_slice() {
            ["own", prefix, uid, mode] => {
                let (uid, mode) = (num(uid)?, num(mode)?);
                for e in entries.iter_mut().filter(|e| e.path.starts_with(prefix)) {
                    e.owner = uid;
                    e.mode = mode | (e.mode & glfs::mode::EXEC) | (e.mode & glfs::mode::HIDDEN);
                }
            }
            ["dev", p, mode] => entries.push(Entry { path: p.to_string(), kind: glfs::kind::DEV, owner: glfs::ROOT, mode: num(mode)?, data: vec![] }),
            ["dir", p, uid, mode] => entries.push(Entry { path: p.to_string(), kind: glfs::kind::DIR, owner: num(uid)?, mode: num(mode)?, data: vec![] }),
            // Generated files may be absent (a build without the portfolio, as in the tests).
            ["exec", p] => {
                if let Some(e) = entries.iter_mut().find(|e| e.path == *p) {
                    e.mode |= glfs::mode::EXEC
                }
            }
            ["alias", p, from] => {
                let src = entries.iter().find(|e| e.path == *from).cloned().ok_or_else(|| BuildError(format!("fs.txt:{}: no {from}", i + 1)))?;
                entries.push(Entry { path: p.to_string(), ..src });
            }
            _ => return Err(BuildError(format!("fs.txt:{}: can't read `{line}`", i + 1))),
        }
    }
    Ok(())
}
