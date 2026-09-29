//! Runs a GL-1 without a screen: boots it, types into it, reads what it says.
//! The CLI's `run` and the OS tests are built on this.

use crate::build::Os;
use crate::machine::{Machine, Power};

pub struct Headless {
    pub m: Machine,
    /// Everything the console printed, ANSI and all.
    pub out: String,
    /// Every message the machine sent to the host.
    pub messages: Vec<String>,
    /// How the host answers a message (device reads, frames, `who`...).
    pub answer: Box<dyn FnMut(&str) -> String>,
    card: Option<String>,
    /// The headless card waits for end-of-input before answering (to test pipes).
    pub card_waits_for_input: bool,
}

impl Headless {
    pub fn boot(os: &Os, user: u8, lang: u8) -> Self {
        let mut m = Machine::new(&os.rom, os.disk.clone());
        // One card on the bus: the headless one just echoes what it was asked.
        m.card.installed = 1 << 1;
        m.boot_user = user;
        m.lang = lang;
        m.unix_time = 1_790_000_000;
        m.reset();
        Headless { m, out: String::new(), messages: vec![], answer: Box::new(|_| String::new()), card: None, card_waits_for_input: false }
    }

    /// Emulated time passes; the console is drained and messages are answered.
    pub fn run(&mut self, ms: u32) {
        for _ in 0..ms.div_ceil(10) {
            if self.m.power != Power::On {
                break;
            }
            self.m.run(10.0);
            let c = self.m.take_console();
            self.out.push_str(&String::from_utf8_lossy(&c));
            while let Some(msg) = self.m.take_message() {
                let s = String::from_utf8_lossy(&msg).to_string();
                let r = (self.answer)(&s);
                self.messages.push(s);
                self.m.reply(r.as_bytes());
            }
            while let Some((id, cmd)) = self.m.take_card_request() {
                // header: P|T, 0x1F, cwd, 0x1F, command
                let text = String::from_utf8_lossy(&cmd).to_string();
                let command = text.splitn(3, '\x1f').nth(2).unwrap_or(&text).to_string();
                self.card = Some(format!("[card {id}: {command}]"));
            }
            // It answers once the machine has said all it had to say (stdin, when piped).
            if self.card.is_some() && self.m.card.input_closed || self.card.is_some() && !self.card_waits_for_input {
                let mut text = self.card.take().unwrap();
                let input = self.m.card_take_input();
                if !input.is_empty() {
                    text.push_str(&format!(" stdin={}", String::from_utf8_lossy(&input).trim()));
                }
                text.push('\n');
                self.m.card_output(text.as_bytes());
                self.m.card_finish(0);
            }
        }
    }

    /// Runs until `needle` shows up in the output (after `from`), or `max_ms` pass.
    pub fn until(&mut self, needle: &str, max_ms: u32) -> bool {
        let from = self.out.len();
        let mut t = 0;
        while t < max_ms {
            self.run(20);
            t += 20;
            if self.out[from.min(self.out.len())..].contains(needle) {
                return true;
            }
        }
        false
    }

    pub fn type_str(&mut self, s: &str) {
        for b in s.bytes() {
            self.m.key(if b == b'\n' { b'\r' } else { b });
            self.run(10);
        }
    }

    /// Types a line and runs until the prompt comes back (or `max_ms`), returning what it printed.
    pub fn cmd(&mut self, line: &str, prompt: &str, max_ms: u32) -> String {
        let from = self.out.len();
        self.type_str(line);
        self.type_str("\n");
        self.until(prompt, max_ms);
        strip_ansi(&self.out[from..])
    }
}

pub fn strip_ansi(s: &str) -> String {
    let mut out = String::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\x1b' {
            if it.peek() == Some(&'[') {
                it.next();
                for d in it.by_ref() {
                    if d.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}
