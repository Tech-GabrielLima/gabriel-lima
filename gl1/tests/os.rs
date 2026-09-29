//! Boots GL-OS on the GL-1 and uses it like a person would.

use gl1::build;
use gl1::headless::Headless;
use std::path::Path;

fn boot(user: u8) -> Headless {
    let os = build::build(Path::new("os"), &[]).unwrap_or_else(|e| panic!("{}", e.0));
    let mut h = Headless::boot(&os, user, 0);
    h.run(3000);
    assert!(h.out.contains(if user == 0 { "# " } else { "$ " }), "no prompt:\n{}", h.out);
    h
}

#[test]
fn boots_to_a_shell_at_home() {
    let mut h = boot(1);
    let screen = gl1::headless::strip_ansi(&h.out);
    assert!(screen.contains("GL-1  BIOS"), "{screen}");
    assert!(screen.contains("GL-OS 0.1"), "{screen}");
    let out = h.cmd("pwd", "$ ", 2000);
    assert!(out.contains("/home/visitante"), "{out}");
}

#[test]
fn files_and_directories() {
    let mut h = boot(1);
    let out = h.cmd("ls /", "$ ", 3000);
    assert!(out.contains("bin/") && out.contains("etc/"), "{out}");
    let out = h.cmd("cat notas.txt", "$ ", 3000);
    assert!(out.contains("popcorn"), "{out}");
    let out = h.cmd("cat /nope", "$ ", 3000);
    assert!(out.contains("no such file"), "{out}");
}

#[test]
fn redirection_and_pipes() {
    let mut h = boot(1);
    h.cmd("echo hello from the booth > /tmp/a.txt", "$ ", 3000);
    let out = h.cmd("cat /tmp/a.txt", "$ ", 3000);
    assert!(out.contains("hello from the booth"), "{out}");
    h.cmd("echo second line >> /tmp/a.txt", "$ ", 3000);
    let out = h.cmd("cat /tmp/a.txt | cat", "$ ", 4000);
    assert!(out.contains("hello from the booth") && out.contains("second line"), "{out}");
}

#[test]
fn permissions_hold() {
    let mut h = boot(1);
    let out = h.cmd("ls /root", "$ ", 3000);
    assert!(out.contains("permission denied"), "{out}");
    let out = h.cmd("echo x > /etc/motd.visitante.en", "$ ", 3000);
    assert!(out.contains("permission denied"), "{out}");
}

#[test]
fn unknown_commands_and_exit() {
    let mut h = boot(1);
    let out = h.cmd("frobnicate", "$ ", 3000);
    assert!(out.contains("command not found"), "{out}");
    let out = h.cmd("exit", "$ ", 3000);
    assert!(out.contains("You're not done."), "{out}");
}

#[test]
fn processes_are_real() {
    let mut h = boot(1);
    let out = h.cmd("ps", "$ ", 3000);
    assert!(out.contains("init") && out.contains("lanterninha") && out.contains("sh"), "{out}");
    let out = h.cmd("kill 1", "$ ", 3000);
    assert!(out.contains("init doesn't die"), "{out}");
    let out = h.cmd("kill 2", "$ ", 3000);
    assert!(out.contains("not permitted"), "a visitor can't kill root's usher: {out}");
}

#[test]
fn root_kills_the_usher_and_he_comes_back() {
    let mut h = boot(0);
    let out = h.cmd("kill 2", "# ", 3000);
    assert!(out.contains("light went out"), "{out}");
    assert!(h.messages.iter().any(|m| m == "frame kill"));
    // init brings him back two minutes later, with another pid
    h.run(125_000);
    assert!(h.messages.iter().any(|m| m == "usher back"), "{:?}", h.messages);
    let out = h.cmd("ps", "# ", 3000);
    assert!(out.contains("lanterninha"), "{out}");
}

#[test]
fn rm_rf_slash_really_removes_everything() {
    let mut h = boot(0);
    h.cmd("rm -rf /", "# ", 30_000);
    assert!(h.messages.iter().any(|m| m == "frame rmrf"));
    let out = h.cmd("ls", "# ", 3000);
    assert!(out.contains("command not found"), "{out}");
    // copy-on-write: the original disk is still under the overlay
    h.m.disk.overlay.clear();
    h.m.reset();
    assert!(h.until("# ", 5000));
    let out = h.cmd("ls /", "# ", 3000);
    assert!(out.contains("bin/"), "{out}");
}

#[test]
fn expansion_cards_get_the_command_and_the_pipe() {
    let mut h = boot(1);
    let out = h.cmd("python -c 'print(1)'", "$ ", 3000);
    assert!(out.contains("[card 1: python -c 'print(1)']"), "{out}");
    h.card_waits_for_input = true;
    let out = h.cmd("cat notas.txt | duckdb", "$ ", 5000);
    assert!(out.contains("[card 1: duckdb ] stdin=Things to buy popcorn with."), "{out}");
}

#[test]
fn the_host_writes_files_the_machine_then_reads() {
    let mut h = boot(1);
    let out = h.cmd("cat notas.txt", "$ ", 3000);
    assert!(out.contains("popcorn"));
    gl1::glfs::LiveFs { disk: &mut h.m.disk }.write("/home/visitante/notas.txt", b"rewritten by a card\n", 1, 1).unwrap();
    gl1::glfs::LiveFs { disk: &mut h.m.disk }.write("/tmp/new.txt", &vec![b'y'; 1500], 1, 1).unwrap();
    let out = h.cmd("cat notas.txt", "$ ", 3000);
    assert!(out.contains("rewritten by a card"), "{out}");
    let out = h.cmd("grep yyyy /tmp/new.txt", "$ ", 3000);
    assert!(out.contains("yyyy"), "{out}");
    // and what the machine wrote, the host reads
    h.cmd("echo from the shell > /tmp/s.txt", "$ ", 3000);
    let back = gl1::glfs::LiveFs { disk: &mut h.m.disk }.read("/tmp/s.txt").unwrap();
    assert_eq!(back, b"from the shell\n");
}

#[test]
fn the_arcade_game_plays_and_scores() {
    let mut h = boot(1);
    h.type_str("pipoca\n");
    h.run(300);
    assert_eq!(h.m.display_mode, 1, "not in graphics mode:\n{}", h.out);
    // A player that reads the screen: follow the popcorn with the bucket's middle.
    for _ in 0..600 {
        let v = h.m.vram().to_vec();
        let pop = (6..90).flat_map(|r| (0..40).map(move |c| (r, c))).find(|&(r, c)| v[r * 40 + c] == 0xAA).map(|(_, c)| c);
        let bucket = (0..40).find(|&c| v[92 * 40 + c] == 0xFF);
        h.m.pad = match (pop, bucket) {
            (Some(p), Some(b)) if p < b + 1 => 1,
            (Some(p), Some(b)) if p > b + 1 => 2,
            _ => 0,
        };
        h.run(20);
    }
    assert!(h.m.frames > 100, "frames: {}", h.m.frames);
    // Leave with B.
    h.m.pad = 1 << 5;
    h.run(200);
    assert_eq!(h.m.display_mode, 0);
    let screen = gl1::headless::strip_ansi(&h.out);
    let score: u32 = screen.split("score: ").nth(1).and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse().ok()).unwrap_or(0);
    assert!(score >= 3, "{screen}");
    assert!(h.messages.iter().any(|m| m == "frame arcade"), "{:?}", h.messages);
}
