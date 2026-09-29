//! The GL-1 machine: the CPU plus everything on its bus.
//!
//! ```text
//! $0000-$DFFF  RAM (56 KB)
//! $E000-$EF9F  VRAM, 160x100 at 2 bits per pixel (graphics mode)
//! $F000-$FFFF  ROM (4 KB), vectors at $FFE0
//! ```
//!
//! Devices sit on I/O ports (see `port`). The host (the browser, or the CLI)
//! drives the machine with `run(ms)`, feeds it keys, and drains its console,
//! its expansion-card requests and its mailbox.

use crate::cpu::{Bus, Cpu, Trap};
use crate::isa::vector;
use std::collections::{HashMap, VecDeque};

pub const CLOCK_HZ: u64 = 8_000_000;
pub const ROM_BASE: u16 = 0xF000;
pub const VRAM_BASE: u16 = 0xE000;
pub const VRAM_W: usize = 160;
pub const VRAM_H: usize = 100;
pub const VRAM_LEN: usize = VRAM_W * VRAM_H / 4;
pub const SECTOR: usize = 512;

pub mod port {
    pub const CON_OUT: u8 = 0x00;
    pub const CON_IN: u8 = 0x01;
    /// bit0: a key is waiting
    pub const CON_STATUS: u8 = 0x02;
    pub const CON_COLS: u8 = 0x03;
    pub const CON_ROWS: u8 = 0x04;
    /// 0 text, 1 graphics
    pub const DISP_MODE: u8 = 0x05;
    /// Any write: the frame in VRAM is complete.
    pub const DISP_FLIP: u8 = 0x06;
    /// Timer period in ms (0 = off); each tick raises IRQ 0.
    pub const TIMER: u8 = 0x10;
    /// Reading CLOCK0 latches the uptime in ms; CLOCK1..3 are its higher bytes.
    pub const CLOCK0: u8 = 0x11;
    /// Reading UPSEC0 latches the uptime in whole seconds (16 bits); UPSEC1 is its high byte.
    pub const UPSEC0: u8 = 0x15;
    pub const UPSEC1: u8 = 0x16;
    /// Reading RTC0 latches the Unix time in seconds; RTC1..3 are its higher bytes.
    pub const RTC0: u8 = 0x18;
    pub const RNG: u8 = 0x1C;
    pub const DISK_SEC_LO: u8 = 0x20;
    pub const DISK_SEC_HI: u8 = 0x21;
    pub const DISK_DMA_LO: u8 = 0x22;
    pub const DISK_DMA_HI: u8 = 0x23;
    /// 1 read sector → DMA, 2 write DMA → sector, 3 revert every write since power-on (copy-on-write)
    pub const DISK_CMD: u8 = 0x24;
    /// 0 ok, 1 out of range
    pub const DISK_STATUS: u8 = 0x25;
    pub const DISK_SIZE_LO: u8 = 0x26;
    pub const DISK_SIZE_HI: u8 = 0x27;
    /// 1 if the host changed the disk since the last read of this port (the kernel drops its cache).
    pub const DISK_CHANGED: u8 = 0x28;
    pub const IRQ_MASK: u8 = 0x30;
    pub const IRQ_PENDING: u8 = 0x31;
    pub const IRQ_ACK: u8 = 0x32;
    /// The n of the last `INT n`.
    pub const SWI: u8 = 0x34;
    /// Write: which card. Read (after it's done): its exit code.
    pub const CARD_SEL: u8 = 0x40;
    /// Before start: the command line. While running: bytes both ways.
    pub const CARD_DATA: u8 = 0x41;
    /// bit0 output waiting, bit1 running, bit2 done, bit3 the selected card is installed
    pub const CARD_STATUS: u8 = 0x42;
    /// 1 start, 2 interrupt (Ctrl+C), 3 reset, 4 end of input
    pub const CARD_CTRL: u8 = 0x43;
    /// Write: a byte of the message. Read: a byte of the reply.
    pub const HOST_DATA: u8 = 0x50;
    /// bit0 reply byte waiting, bit1 reply complete
    pub const HOST_STATUS: u8 = 0x51;
    /// 1 send the message (and forget the last reply)
    pub const HOST_CTRL: u8 = 0x52;
    /// 1 power off, 2 reboot, 3 panic
    pub const POWER: u8 = 0x60;
    /// 0 root, 1 visitante, 2 caixa: who the terminal this machine sits in logs in as.
    pub const BOOT_USER: u8 = 0x61;
    /// 0 English, 1 Português: the site's language, so GL-OS speaks it too.
    pub const LANG: u8 = 0x62;
    /// Game buttons held: bit0 left, 1 right, 2 up, 3 down, 4 A, 5 B, 6 start
    pub const PAD: u8 = 0x63;
    /// A note to play (MIDI number), 0 = silence.
    pub const TONE: u8 = 0x64;
}

pub mod irq {
    pub const TIMER: u8 = 1 << 0;
    pub const KEY: u8 = 1 << 1;
    pub const CARD: u8 = 1 << 3;
    pub const HOST: u8 = 1 << 4;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Power {
    On,
    Off,
    Reboot,
    Panic,
}

/// A disk that never loses its original: writes go to an overlay, and
/// "revert" throws the overlay away.
#[derive(Clone, Default)]
pub struct Disk {
    pub base: Vec<u8>,
    pub overlay: HashMap<u16, Vec<u8>>,
    /// Set when the host writes behind the machine's back.
    pub changed: bool,
}

impl Card {
    /// Running until it's done and the machine has read everything it said.
    fn busy(&self) -> bool {
        self.running && !(self.done && self.output.is_empty())
    }
}

impl Disk {
    /// An image may be shipped trimmed to its used sectors: the boot block
    /// says how big the disk really is, and the rest is zeros.
    pub fn new(mut image: Vec<u8>) -> Self {
        if image.len() >= 22 && &image[..2] == b"GL" {
            let total = u16::from_le_bytes([image[20], image[21]]) as usize * SECTOR;
            if image.len() < total {
                image.resize(total, 0);
            }
        }
        Disk { base: image, overlay: HashMap::new(), changed: false }
    }
    pub fn sectors(&self) -> u16 {
        (self.base.len() / SECTOR).min(0xFFFF) as u16
    }
    pub fn read(&self, s: u16) -> Option<Vec<u8>> {
        if s >= self.sectors() {
            return None;
        }
        Some(self.overlay.get(&s).cloned().unwrap_or_else(|| self.base[s as usize * SECTOR..(s as usize + 1) * SECTOR].to_vec()))
    }
    pub fn write(&mut self, s: u16, data: &[u8]) -> bool {
        if s >= self.sectors() {
            return false;
        }
        self.overlay.insert(s, data[..SECTOR].to_vec());
        true
    }
}

#[derive(Default)]
pub struct Card {
    pub selected: u8,
    /// Which card ids are installed (bit per id, 0..63).
    pub installed: u64,
    command: Vec<u8>,
    pub running: bool,
    done: bool,
    code: u8,
    /// Card → machine.
    output: VecDeque<u8>,
    /// Machine → card, while running.
    input: Vec<u8>,
    requests: VecDeque<(u8, Vec<u8>)>,
    interrupted: bool,
    /// The machine has sent everything it had for the card's stdin (CTRL 4).
    pub input_closed: bool,
}

#[derive(Default)]
pub struct Mailbox {
    building: Vec<u8>,
    outbox: VecDeque<Vec<u8>>,
    reply: VecDeque<u8>,
    complete: bool,
}

pub struct Machine {
    pub cpu: Cpu,
    pub mem: Vec<u8>,
    pub disk: Disk,
    pub power: Power,
    pub boot_user: u8,
    pub lang: u8,
    pub cols: u8,
    pub rows: u8,
    pub display_mode: u8,
    pub frames: u32,
    pub pad: u8,
    pub tone: u8,
    pub console: Vec<u8>,
    keys: VecDeque<u8>,
    pub card: Card,
    pub mail: Mailbox,
    timer_ms: u8,
    next_tick: f64,
    /// Emulated time since power-on.
    pub uptime_ms: f64,
    /// Set by the host.
    pub unix_time: u64,
    irq_mask: u8,
    timer_latched: bool,
    swi: u8,
    clock_latch: u32,
    rtc_latch: u32,
    rng: u32,
    disk_sector: u16,
    disk_dma: u16,
    disk_status: u8,
    pub last_trap: Option<Trap>,
}

impl Machine {
    pub fn new(rom: &[u8], disk: Vec<u8>) -> Self {
        let mut m = Machine {
            cpu: Cpu::default(),
            mem: vec![0; 0x10000],
            disk: Disk::new(disk),
            power: Power::On,
            boot_user: 1,
            lang: 0,
            cols: 80,
            rows: 25,
            display_mode: 0,
            frames: 0,
            pad: 0,
            tone: 0,
            console: vec![],
            keys: VecDeque::new(),
            card: Card::default(),
            mail: Mailbox::default(),
            timer_ms: 0,
            next_tick: 0.0,
            uptime_ms: 0.0,
            unix_time: 0,
            irq_mask: 0,
            timer_latched: false,
            swi: 0,
            clock_latch: 0,
            rtc_latch: 0,
            rng: 0x2F6E_2B1D,
            disk_sector: 0,
            disk_dma: 0,
            disk_status: 0,
            last_trap: None,
        };
        let n = rom.len().min(0x1000);
        m.mem[0x10000 - 0x1000..0x10000 - 0x1000 + n].copy_from_slice(&rom[..n]);
        m.reset();
        m
    }

    /// Power cycle: RAM is cleared, the ROM and the disk (with its overlay) stay.
    pub fn reset(&mut self) {
        let rom = self.mem[ROM_BASE as usize..].to_vec();
        self.mem.iter_mut().for_each(|b| *b = 0);
        self.mem[ROM_BASE as usize..].copy_from_slice(&rom);
        self.power = Power::On;
        self.display_mode = 0;
        self.timer_ms = 0;
        self.irq_mask = 0;
        self.timer_latched = false;
        self.keys.clear();
        self.card.command.clear();
        self.card.running = false;
        self.card.done = false;
        self.card.output.clear();
        self.card.input.clear();
        self.mail = Mailbox::default();
        self.uptime_ms = 0.0;
        self.next_tick = 0.0;
        let mut cpu = Cpu::default();
        cpu.reset(self);
        self.cpu = cpu;
    }

    pub fn key(&mut self, b: u8) {
        if self.keys.len() < 256 {
            self.keys.push_back(b);
        }
    }

    fn pending(&self) -> u8 {
        let mut p = 0;
        if self.timer_latched {
            p |= irq::TIMER;
        }
        if !self.keys.is_empty() {
            p |= irq::KEY;
        }
        if !self.card.output.is_empty() || self.card.done {
            p |= irq::CARD;
        }
        if self.mail.complete {
            p |= irq::HOST;
        }
        p
    }

    /// Runs `ms` milliseconds of emulated time. Returns the cycles executed.
    pub fn run(&mut self, ms: f64) -> u64 {
        let budget = (ms * CLOCK_HZ as f64 / 1000.0) as u64;
        let start = self.cpu.cycles;
        let per_ms = CLOCK_HZ as f64 / 1000.0;
        while self.cpu.cycles - start < budget && self.power == Power::On {
            let now = self.uptime_ms;
            if self.timer_ms > 0 && now >= self.next_tick {
                self.timer_latched = true;
                self.next_tick = now + self.timer_ms as f64;
            }
            let wake = self.pending() & self.irq_mask;
            if wake != 0 && self.cpu.interrupts_enabled() {
                let line = wake.trailing_zeros() as u8;
                let mut cpu = std::mem::take(&mut self.cpu);
                cpu.interrupt(self, vector::IRQ0 + line);
                self.cpu = cpu;
            }
            if self.cpu.halted {
                if !self.cpu.interrupts_enabled() || (self.timer_ms == 0 && self.irq_mask & !irq::TIMER == 0) {
                    // Halted with nothing that could wake it: the machine is done.
                    break;
                }
                // Skip ahead to the next tick (or the end of this slice), like a real idle CPU.
                let left = (budget - (self.cpu.cycles - start)) as f64 / per_ms;
                let until = if self.timer_ms > 0 { (self.next_tick - now).max(0.0) } else { left };
                let skip = until.min(left).max(1.0 / per_ms);
                if self.pending() & self.irq_mask != 0 {
                    self.cpu.halted = false;
                    continue;
                }
                self.uptime_ms += skip;
                self.cpu.cycles += (skip * per_ms) as u64 + 1;
                continue;
            }
            let mut cpu = std::mem::take(&mut self.cpu);
            let r = cpu.step(self);
            self.cpu = cpu;
            let cy = match r {
                Ok(c) => c,
                Err(t) => {
                    self.last_trap = Some(t);
                    6
                }
            };
            self.uptime_ms += cy as f64 / per_ms;
        }
        self.cpu.cycles - start
    }

    pub fn take_console(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.console)
    }

    /* ------------------------------------------------ expansion cards (host side) */

    pub fn take_card_request(&mut self) -> Option<(u8, Vec<u8>)> {
        self.card.requests.pop_front()
    }
    pub fn card_output(&mut self, bytes: &[u8]) {
        self.card.output.extend(bytes);
    }
    pub fn card_take_input(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.card.input)
    }
    pub fn card_finish(&mut self, code: u8) {
        self.card.code = code;
        self.card.done = true;
    }
    pub fn card_take_interrupt(&mut self) -> bool {
        std::mem::take(&mut self.card.interrupted)
    }

    /* ------------------------------------------------ mailbox (host side) */

    pub fn take_message(&mut self) -> Option<Vec<u8>> {
        self.mail.outbox.pop_front()
    }
    pub fn reply(&mut self, bytes: &[u8]) {
        self.mail.reply.extend(bytes);
        self.mail.complete = true;
    }

    pub fn vram(&self) -> &[u8] {
        &self.mem[VRAM_BASE as usize..VRAM_BASE as usize + VRAM_LEN]
    }

    fn disk_cmd(&mut self, cmd: u8) {
        self.disk_status = 0;
        match cmd {
            1 => match self.disk.read(self.disk_sector) {
                Some(data) => {
                    for (i, b) in data.into_iter().enumerate() {
                        let a = self.disk_dma.wrapping_add(i as u16);
                        self.write(a, b);
                    }
                }
                None => self.disk_status = 1,
            },
            2 => {
                let data: Vec<u8> = (0..SECTOR as u16).map(|i| self.mem[self.disk_dma.wrapping_add(i) as usize]).collect();
                if !self.disk.write(self.disk_sector, &data) {
                    self.disk_status = 1;
                }
            }
            3 => self.disk.overlay.clear(),
            _ => self.disk_status = 1,
        }
    }
}

impl Bus for Machine {
    fn read(&mut self, a: u16) -> u8 {
        self.mem[a as usize]
    }
    fn write(&mut self, a: u16, v: u8) {
        if a < ROM_BASE {
            self.mem[a as usize] = v;
        }
    }
    fn swi(&mut self, n: u8) {
        self.swi = n;
    }
    fn input(&mut self, p: u8) -> u8 {
        use port::*;
        match p {
            CON_IN => self.keys.pop_front().unwrap_or(0),
            CON_STATUS => !self.keys.is_empty() as u8,
            CON_COLS => self.cols,
            CON_ROWS => self.rows,
            DISP_MODE => self.display_mode,
            TIMER => self.timer_ms,
            CLOCK0 => {
                self.clock_latch = self.uptime_ms as u32;
                self.clock_latch as u8
            }
            0x12..=0x14 => (self.clock_latch >> (8 * (p - CLOCK0))) as u8,
            UPSEC0 => {
                self.clock_latch = (self.uptime_ms / 1000.0) as u32;
                self.clock_latch as u8
            }
            UPSEC1 => (self.clock_latch >> 8) as u8,
            RTC0 => {
                self.rtc_latch = self.unix_time as u32;
                self.rtc_latch as u8
            }
            0x19..=0x1B => (self.rtc_latch >> (8 * (p - RTC0))) as u8,
            RNG => {
                // xorshift32, stirred by the clock
                self.rng ^= self.rng << 13;
                self.rng ^= self.rng >> 17;
                self.rng ^= self.rng << 5;
                (self.rng ^ self.cpu.cycles as u32) as u8
            }
            DISK_STATUS => self.disk_status,
            DISK_SIZE_LO => self.disk.sectors() as u8,
            DISK_SIZE_HI => (self.disk.sectors() >> 8) as u8,
            DISK_CHANGED => std::mem::take(&mut self.disk.changed) as u8,
            IRQ_MASK => self.irq_mask,
            IRQ_PENDING => self.pending(),
            SWI => self.swi,
            CARD_SEL => self.card.code,
            CARD_DATA => self.card.output.pop_front().unwrap_or(0),
            CARD_STATUS => {
                let c = &self.card;
                (!c.output.is_empty()) as u8 | (c.busy() as u8) << 1 | (c.done as u8) << 2 | ((c.installed >> (c.selected & 63) & 1) as u8) << 3
            }
            HOST_DATA => self.mail.reply.pop_front().unwrap_or(0),
            HOST_STATUS => (!self.mail.reply.is_empty()) as u8 | (self.mail.complete as u8) << 1,
            BOOT_USER => self.boot_user,
            LANG => self.lang,
            PAD => self.pad,
            _ => 0xFF,
        }
    }
    fn output(&mut self, p: u8, v: u8) {
        use port::*;
        match p {
            CON_OUT => {
                if self.console.len() < 1 << 20 {
                    self.console.push(v)
                }
            }
            DISP_MODE => self.display_mode = v & 1,
            DISP_FLIP => self.frames = self.frames.wrapping_add(1),
            TIMER => {
                self.timer_ms = v;
                self.next_tick = self.uptime_ms + v as f64;
            }
            DISK_SEC_LO => self.disk_sector = (self.disk_sector & 0xFF00) | v as u16,
            DISK_SEC_HI => self.disk_sector = (self.disk_sector & 0x00FF) | (v as u16) << 8,
            DISK_DMA_LO => self.disk_dma = (self.disk_dma & 0xFF00) | v as u16,
            DISK_DMA_HI => self.disk_dma = (self.disk_dma & 0x00FF) | (v as u16) << 8,
            DISK_CMD => self.disk_cmd(v),
            IRQ_MASK => self.irq_mask = v,
            IRQ_ACK => {
                if v & irq::TIMER != 0 {
                    self.timer_latched = false
                }
            }
            CARD_SEL => {
                self.card.selected = v;
                if !self.card.busy() {
                    self.card.running = false;
                    self.card.command.clear();
                    self.card.done = false;
                }
            }
            CARD_DATA => {
                if self.card.busy() {
                    self.card.input.push(v)
                } else if self.card.command.len() < 1024 {
                    self.card.command.push(v)
                }
            }
            CARD_CTRL => match v {
                1 => {
                    let cmd = std::mem::take(&mut self.card.command);
                    self.card.requests.push_back((self.card.selected, cmd));
                    self.card.running = true;
                    self.card.done = false;
                    self.card.input_closed = false;
                    self.card.output.clear();
                }
                2 => self.card.interrupted = true,
                4 => self.card.input_closed = true,
                _ => {
                    self.card.running = false;
                    self.card.done = false;
                    self.card.command.clear();
                    self.card.output.clear();
                }
            },
            HOST_DATA => {
                if self.mail.building.len() < 4096 {
                    self.mail.building.push(v)
                }
            }
            HOST_CTRL => {
                if v == 1 {
                    let msg = std::mem::take(&mut self.mail.building);
                    self.mail.outbox.push_back(msg);
                    self.mail.reply.clear();
                    self.mail.complete = false;
                }
            }
            POWER => {
                self.power = match v {
                    1 => Power::Off,
                    2 => Power::Reboot,
                    _ => Power::Panic,
                }
            }
            TONE => self.tone = v,
            _ => {}
        }
    }
}
