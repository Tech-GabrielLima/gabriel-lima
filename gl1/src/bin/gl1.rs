//! gl1: build GL-OS, assemble, disassemble, and run a GL-1 in the terminal.
//!
//!   gl1 build <os-dir> <out-dir> [extra-root...]   rom.bin, disk.img, kernel.lst
//!   gl1 asm <file.s> [-o out] [-I inc]              a .glx (relocatable) or raw binary
//!   gl1 run <os-dir> [--user N] [--lang pt] [--ms N] [--type "ls\n"]
//!   gl1 dis <file> [org]

use gl1::build;
use gl1::headless::{strip_ansi, Headless};
use std::path::{Path, PathBuf};

fn flag(args: &[String], k: &str) -> Option<String> {
    args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = match args.first().map(String::as_str) {
        Some("build") if args.len() >= 3 => {
            let extra: Vec<PathBuf> = args[3..].iter().map(PathBuf::from).collect();
            match build::build(Path::new(&args[1]), &extra) {
                Ok(os) => {
                    let out = Path::new(&args[2]);
                    std::fs::create_dir_all(out).unwrap();
                    std::fs::write(out.join("rom.bin"), &os.rom).unwrap();
                    // Only the used sectors ship; the machine pads the rest (Disk::new).
                    let used = u16::from_le_bytes([os.disk[18], os.disk[19]]) as usize * gl1::glfs::SECTOR;
                    std::fs::write(out.join("disk.img"), &os.disk[..used]).unwrap();
                    let mut syms: Vec<_> = os.kernel.symbols.iter().filter(|(k, _)| !k.contains('.')).collect();
                    syms.sort_by_key(|(_, v)| **v);
                    let lst: String = syms.iter().map(|(k, v)| format!("{v:04X} {k}\n")).collect();
                    std::fs::write(out.join("kernel.sym"), lst).unwrap();
                    eprintln!("rom {} B · kernel {} B · {} programs · disk {} KB ({} KB used)", os.rom.len(), os.kernel.bytes.len(), os.programs.len(), os.disk.len() / 1024, u16::from_le_bytes([os.disk[18], os.disk[19]]) as usize / 2);
                    0
                }
                Err(e) => {
                    eprintln!("{}", e.0);
                    1
                }
            }
        }
        Some("asm") if args.len() >= 2 => {
            let inc = flag(&args, "-I").unwrap_or_else(|| ".".into());
            match build::assemble_file(Path::new(&args[1]), Path::new(&inc)) {
                Ok(p) => {
                    let out = flag(&args, "-o").unwrap_or_else(|| args[1].replace(".s", if p.relocatable { ".glx" } else { ".bin" }));
                    let bytes = if p.relocatable { gl1::glx::from_program(&p) } else { p.bytes.clone() };
                    std::fs::write(&out, bytes).unwrap();
                    eprintln!("{out}: {} bytes at ${:04X}, {} relocations", p.bytes.len(), p.org, p.relocs.len());
                    0
                }
                Err(e) => {
                    eprintln!("{}", e.0);
                    1
                }
            }
        }
        Some("run") if args.len() >= 2 => match build::build(Path::new(&args[1]), &flag(&args, "--root").map(PathBuf::from).into_iter().collect::<Vec<_>>()) {
            Ok(os) => {
                let user = flag(&args, "--user").and_then(|u| u.parse().ok()).unwrap_or(1);
                let lang = (flag(&args, "--lang").as_deref() == Some("pt")) as u8;
                let ms = flag(&args, "--ms").and_then(|u| u.parse().ok()).unwrap_or(3000);
                let mut h = Headless::boot(&os, user, lang);
                h.run(ms);
                if let Some(t) = flag(&args, "--type") {
                    for line in t.replace("\\n", "\n").split_inclusive('\n') {
                        h.type_str(line);
                        h.run(ms);
                    }
                }
                print!("{}", if args.iter().any(|a| a == "--raw") { h.out.clone() } else { strip_ansi(&h.out) });
                for m in &h.messages {
                    eprintln!("[host] {m}");
                }
                if let Some(t) = h.m.last_trap {
                    eprintln!("[trap] {t:?}");
                }
                eprintln!("[power {:?} · {} instructions · pc ${:04X}]", h.m.power, h.m.cpu.instructions, h.m.cpu.pc);
                0
            }
            Err(e) => {
                eprintln!("{}", e.0);
                1
            }
        },
        Some("dis") if args.len() >= 2 => {
            let bytes = std::fs::read(&args[1]).unwrap();
            let org = args.get(2).and_then(|o| u16::from_str_radix(o.trim_start_matches('$'), 16).ok()).unwrap_or(0);
            let mut mem = vec![0u8; 0x10000];
            mem[org as usize..org as usize + bytes.len()].copy_from_slice(&bytes);
            let mut at = org;
            while (at as usize) < org as usize + bytes.len() {
                let (t, n) = gl1::asm::disassemble(&mem, at);
                println!("{at:04X}  {t}");
                at = at.wrapping_add(n);
            }
            0
        }
        _ => {
            eprintln!("usage: gl1 build <os> <out> | asm <file.s> | run <os> [--user N --lang pt --type ...] | dis <file> [org]");
            2
        }
    };
    std::process::exit(code);
}
