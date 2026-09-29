//! The GL-1 CPU. It knows registers, flags and the instruction table; memory
//! and ports belong to whatever machine it's plugged into (the `Bus`).

use crate::isa::{self, flag, vector, Mode};

pub trait Bus {
    fn read(&mut self, addr: u16) -> u8;
    fn write(&mut self, addr: u16, v: u8);
    fn input(&mut self, port: u8) -> u8;
    fn output(&mut self, port: u8, v: u8);
    /// `INT n` was executed: the machine latches n for the kernel to read.
    fn swi(&mut self, _n: u8) {}
}

#[derive(Clone, Debug, Default)]
pub struct Cpu {
    /// A B C D
    pub r: [u8; 4],
    pub x: u16,
    pub y: u16,
    pub sp: u16,
    pub pc: u16,
    pub f: u8,
    /// Stopped by HLT until the next interrupt.
    pub halted: bool,
    pub cycles: u64,
    pub instructions: u64,
}

/// Why `step` stopped doing what the program asked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trap {
    /// An opcode that doesn't exist, or a register/pointer index out of range.
    Illegal { at: u16, op: u8 },
}

impl Cpu {
    pub fn reset<B: Bus>(&mut self, bus: &mut B) {
        *self = Cpu::default();
        self.pc = word(bus, vector::BASE + 2 * vector::RESET as u16);
    }

    fn flag(&self, m: u8) -> bool {
        self.f & m != 0
    }
    fn set(&mut self, m: u8, on: bool) {
        if on {
            self.f |= m
        } else {
            self.f &= !m
        }
    }
    fn zn(&mut self, v: u8) {
        self.set(flag::Z, v == 0);
        self.set(flag::N, v & 0x80 != 0);
    }

    pub fn interrupts_enabled(&self) -> bool {
        self.flag(flag::I)
    }

    pub fn reg(&self, i: u8) -> u8 {
        match i {
            0..=3 => self.r[i as usize],
            4 => self.x as u8,
            5 => (self.x >> 8) as u8,
            6 => self.y as u8,
            _ => (self.y >> 8) as u8,
        }
    }
    fn set_reg(&mut self, i: u8, v: u8) {
        match i {
            0..=3 => self.r[i as usize] = v,
            4 => self.x = (self.x & 0xFF00) | v as u16,
            5 => self.x = (self.x & 0x00FF) | (v as u16) << 8,
            6 => self.y = (self.y & 0xFF00) | v as u16,
            _ => self.y = (self.y & 0x00FF) | (v as u16) << 8,
        }
    }
    pub fn ptr(&self, i: u8) -> u16 {
        match i {
            0 => self.x,
            1 => self.y,
            _ => self.sp,
        }
    }
    fn set_ptr(&mut self, i: u8, v: u16) {
        match i {
            0 => self.x = v,
            1 => self.y = v,
            _ => self.sp = v,
        }
    }

    fn fetch<B: Bus>(&mut self, bus: &mut B) -> u8 {
        let v = bus.read(self.pc);
        self.pc = self.pc.wrapping_add(1);
        v
    }
    fn fetch16<B: Bus>(&mut self, bus: &mut B) -> u16 {
        let lo = self.fetch(bus) as u16;
        lo | (self.fetch(bus) as u16) << 8
    }

    pub fn push<B: Bus>(&mut self, bus: &mut B, v: u8) {
        self.sp = self.sp.wrapping_sub(1);
        bus.write(self.sp, v);
    }
    pub fn pop<B: Bus>(&mut self, bus: &mut B) -> u8 {
        let v = bus.read(self.sp);
        self.sp = self.sp.wrapping_add(1);
        v
    }
    pub fn push16<B: Bus>(&mut self, bus: &mut B, v: u16) {
        self.push(bus, (v >> 8) as u8);
        self.push(bus, v as u8);
    }
    pub fn pop16<B: Bus>(&mut self, bus: &mut B) -> u16 {
        let lo = self.pop(bus) as u16;
        lo | (self.pop(bus) as u16) << 8
    }

    /// Enters an interrupt: saves PC and F, disables interrupts, jumps through the vector.
    pub fn interrupt<B: Bus>(&mut self, bus: &mut B, n: u8) {
        self.push16(bus, self.pc);
        self.push(bus, self.f);
        self.f &= !flag::I;
        self.halted = false;
        self.pc = word(bus, vector::BASE + 2 * n as u16);
        self.cycles += 6;
    }

    fn add(&mut self, a: u8, b: u8, c: bool) -> u8 {
        let r = a as u16 + b as u16 + c as u16;
        let v = r as u8;
        self.set(flag::C, r > 0xFF);
        self.set(flag::V, (!(a ^ b) & (a ^ v)) & 0x80 != 0);
        self.zn(v);
        v
    }
    fn sub(&mut self, a: u8, b: u8, c: bool) -> u8 {
        let v = a.wrapping_sub(b).wrapping_sub(c as u8);
        self.set(flag::C, (a as u16) < b as u16 + c as u16);
        self.set(flag::V, ((a ^ b) & (a ^ v)) & 0x80 != 0);
        self.zn(v);
        v
    }
    fn sub16(&mut self, a: u16, b: u16) -> u16 {
        let v = a.wrapping_sub(b);
        self.set(flag::C, a < b);
        self.set(flag::V, ((a ^ b) & (a ^ v)) & 0x8000 != 0);
        self.set(flag::Z, v == 0);
        self.set(flag::N, v & 0x8000 != 0);
        v
    }
    fn add16(&mut self, a: u16, b: u16) -> u16 {
        let (v, c) = a.overflowing_add(b);
        self.set(flag::C, c);
        self.set(flag::Z, v == 0);
        self.set(flag::N, v & 0x8000 != 0);
        v
    }

    /// Runs one instruction. Returns the cycles it took, or the trap it hit
    /// (in which case the CPU has already entered the ILLEGAL vector).
    pub fn step<B: Bus>(&mut self, bus: &mut B) -> Result<u32, Trap> {
        if self.halted {
            self.cycles += 1;
            return Ok(1);
        }
        let at = self.pc;
        let code = self.fetch(bus);
        let Some(op) = isa::decode(code) else {
            return Err(self.illegal(bus, at, code));
        };
        // Operands, decoded by mode.
        let (mut a8, mut b8, mut w) = (0u8, 0u8, 0u16);
        match op.mode {
            Mode::None => {}
            Mode::RR | Mode::R | Mode::PP | Mode::PR | Mode::P | Mode::I8 => a8 = self.fetch(bus),
            Mode::RI | Mode::RX | Mode::PX | Mode::Port => {
                a8 = self.fetch(bus);
                b8 = self.fetch(bus);
            }
            Mode::RA | Mode::PI | Mode::PA => {
                a8 = self.fetch(bus);
                w = self.fetch16(bus);
            }
            Mode::A16 => w = self.fetch16(bus),
        }
        // Register and pointer fields must be in range.
        let ok = match op.mode {
            Mode::RR => true,
            Mode::R | Mode::RI | Mode::RA | Mode::Port => a8 < 8,
            Mode::RX => a8 >> 4 < 3 && a8 & 0xF < 8,
            Mode::PP => a8 >> 4 < 3 && a8 & 0xF < 3,
            Mode::PR => a8 >> 4 < 3 && a8 & 0xF < 8,
            Mode::PX => a8 >> 4 < 3 && a8 & 0xF < 3,
            Mode::P | Mode::PI | Mode::PA => a8 < 3,
            _ => true,
        } && !(op.mode == Mode::RR && (a8 >> 4 >= 8 || a8 & 0xF >= 8));
        if !ok {
            return Err(self.illegal(bus, at, code));
        }
        let (hi, lo) = (a8 >> 4, a8 & 0xF);
        let off = |base: u16| base.wrapping_add(b8 as i8 as i16 as u16);

        match code {
            0x00 => {}
            0x01 => self.set_reg(hi, self.reg(lo)),
            0x02 => self.set_reg(a8, b8),
            0x03 => {
                let v = bus.read(w);
                self.set_reg(a8, v)
            }
            0x04 => {
                let v = bus.read(off(self.ptr(hi)));
                self.set_reg(lo, v)
            }
            0x05 => bus.write(w, self.reg(a8)),
            0x06 => bus.write(off(self.ptr(hi)), self.reg(lo)),
            0x10..=0x1F => {
                let (d, s) = if code < 0x18 { (hi, self.reg(lo)) } else { (a8, b8) };
                let a = self.reg(d);
                let c = self.flag(flag::C);
                let v = match code & 7 {
                    0 => self.add(a, s, false),
                    1 => self.add(a, s, c),
                    2 => self.sub(a, s, false),
                    3 => self.sub(a, s, c),
                    4 | 5 | 6 => {
                        let v = match code & 7 {
                            4 => a & s,
                            5 => a | s,
                            _ => a ^ s,
                        };
                        self.set(flag::C, false);
                        self.set(flag::V, false);
                        self.zn(v);
                        v
                    }
                    _ => {
                        self.sub(a, s, false);
                        a
                    }
                };
                self.set_reg(d, v);
            }
            0x20..=0x28 => {
                let a = self.reg(a8);
                let c = self.flag(flag::C);
                let v = match code {
                    0x20 => a.wrapping_add(1),
                    0x21 => a.wrapping_sub(1),
                    0x22 => {
                        self.set(flag::C, a & 0x80 != 0);
                        a << 1
                    }
                    0x23 => {
                        self.set(flag::C, a & 1 != 0);
                        a >> 1
                    }
                    0x24 => !a,
                    0x25 => self.sub(0, a, false),
                    0x26 => {
                        self.set(flag::C, a & 0x80 != 0);
                        a << 1 | c as u8
                    }
                    0x27 => {
                        self.set(flag::C, a & 1 != 0);
                        a >> 1 | (c as u8) << 7
                    }
                    _ => a,
                };
                self.zn(v);
                self.set_reg(a8, v);
            }
            0x30 => self.set_ptr(a8, w),
            0x31 => {
                let v = word(bus, w);
                self.set_ptr(a8, v)
            }
            0x32 => {
                let v = self.ptr(a8);
                bus.write(w, v as u8);
                bus.write(w.wrapping_add(1), (v >> 8) as u8);
            }
            0x33 => self.set_ptr(hi, self.ptr(lo)),
            0x34 | 0x35 => {
                let v = if code == 0x34 { self.ptr(a8).wrapping_add(1) } else { self.ptr(a8).wrapping_sub(1) };
                self.set(flag::Z, v == 0);
                self.set_ptr(a8, v);
            }
            0x36 => {
                let v = self.add16(self.ptr(hi), self.reg(lo) as u16);
                self.set_ptr(hi, v)
            }
            0x37 => {
                let v = self.add16(self.ptr(a8), w);
                self.set_ptr(a8, v)
            }
            0x38 => {
                self.sub16(self.ptr(a8), w);
            }
            0x39 => {
                self.sub16(self.ptr(hi), self.ptr(lo));
            }
            0x3A => {
                let v = word(bus, off(self.ptr(hi)));
                self.set_ptr(lo, v)
            }
            0x3B => {
                let a = off(self.ptr(hi));
                let v = self.ptr(lo);
                bus.write(a, v as u8);
                bus.write(a.wrapping_add(1), (v >> 8) as u8);
            }
            0x3C => {
                let v = self.sub16(self.ptr(hi), self.ptr(lo));
                self.set_ptr(hi, v)
            }
            0x3D => {
                let v = self.add16(self.ptr(hi), self.ptr(lo));
                self.set_ptr(hi, v)
            }
            0x3E => {
                let v = off(self.ptr(hi));
                self.set_ptr(lo, v)
            }
            0x40 => self.push(bus, self.reg(a8)),
            0x41 => {
                let v = self.pop(bus);
                self.set_reg(a8, v)
            }
            0x42 => self.push16(bus, self.ptr(a8)),
            0x43 => {
                let v = self.pop16(bus);
                self.set_ptr(a8, v)
            }
            0x44 => {
                self.push16(bus, self.pc);
                self.pc = w
            }
            0x45 => self.pc = self.pop16(bus),
            0x46 => {
                self.f = self.pop(bus);
                self.pc = self.pop16(bus)
            }
            0x47 => {
                self.push16(bus, self.pc);
                self.pc = self.ptr(a8)
            }
            0x48 => self.push(bus, self.f),
            0x49 => self.f = self.pop(bus),
            0x50..=0x5A => {
                let (z, c, n, v) = (self.flag(flag::Z), self.flag(flag::C), self.flag(flag::N), self.flag(flag::V));
                let take = match code {
                    0x50 => true,
                    0x51 => z,
                    0x52 => !z,
                    0x53 => c,
                    0x54 => !c,
                    0x55 => n,
                    0x56 => !n,
                    0x57 => n != v,
                    0x58 => n == v,
                    0x59 => !c && !z,
                    _ => c || z,
                };
                if take {
                    self.pc = w
                }
            }
            0x5B => self.pc = self.ptr(a8),
            0x60 => {
                let v = bus.input(b8);
                self.set_reg(a8, v)
            }
            0x61 => bus.output(b8, self.reg(a8)),
            0x70 => self.halted = true,
            0x71 => self.set(flag::I, true),
            0x72 => self.set(flag::I, false),
            0x73 => {
                bus.swi(a8);
                self.interrupt(bus, vector::SWI)
            }
            0x74 => self.interrupt(bus, vector::BRK),
            _ => return Err(self.illegal(bus, at, code)),
        }
        self.cycles += op.cycles as u64;
        self.instructions += 1;
        Ok(op.cycles as u32)
    }

    fn illegal<B: Bus>(&mut self, bus: &mut B, at: u16, op: u8) -> Trap {
        self.pc = at;
        self.interrupt(bus, vector::ILLEGAL);
        Trap::Illegal { at, op }
    }
}

pub fn word<B: Bus>(bus: &mut B, a: u16) -> u16 {
    bus.read(a) as u16 | (bus.read(a.wrapping_add(1)) as u16) << 8
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Ram(Vec<u8>, Vec<u8>);
    impl Bus for Ram {
        fn read(&mut self, a: u16) -> u8 {
            self.0[a as usize]
        }
        fn write(&mut self, a: u16, v: u8) {
            self.0[a as usize] = v
        }
        fn input(&mut self, p: u8) -> u8 {
            p ^ 0xFF
        }
        fn output(&mut self, _p: u8, v: u8) {
            self.1.push(v)
        }
    }

    fn run(code: &[u8]) -> (Cpu, Ram) {
        let mut m = Ram(vec![0; 65536], vec![]);
        m.0[0x100..0x100 + code.len()].copy_from_slice(code);
        m.0[0xFFE0] = 0x00;
        m.0[0xFFE1] = 0x01;
        let mut c = Cpu::default();
        c.reset(&mut m);
        c.sp = 0xE000;
        while !c.halted {
            c.step(&mut m).unwrap();
        }
        (c, m)
    }

    #[test]
    fn arithmetic_and_flags() {
        // MOV A,#200 ; ADD A,#100 -> 44, C ; HLT
        let (c, _) = run(&[0x02, 0, 200, 0x18, 0, 100, 0x70]);
        assert_eq!(c.r[0], 44);
        assert!(c.f & flag::C != 0);
        // MOV A,#5 ; CMP A,#7 -> borrow, not zero
        let (c, _) = run(&[0x02, 0, 5, 0x1F, 0, 7, 0x70]);
        assert!(c.f & flag::C != 0 && c.f & flag::Z == 0);
    }

    #[test]
    fn pointers_stack_and_calls() {
        // LDW X,#$2000 ; MOV A,#42 ; ST [X+3],A ; CALL $0110 ; HLT
        // $0110: LD B,[X+3] ; RET
        let mut code = vec![0x30, 0, 0x00, 0x20, 0x02, 0, 42, 0x06, 0x00, 3, 0x44, 0x10, 0x01, 0x70];
        code.resize(0x10, 0);
        code.extend([0x04, 0x01, 3, 0x45]);
        let (c, m) = run(&code);
        assert_eq!(m.0[0x2003], 42);
        assert_eq!(c.r[1], 42);
        assert_eq!(c.sp, 0xE000);
    }

    #[test]
    fn halves_of_x_are_registers() {
        // LDW X,#$1234 ; MOV A,XH ; MOV XL,#$FF ; HLT
        let (c, _) = run(&[0x30, 0, 0x34, 0x12, 0x01, 0x05, 0x02, 4, 0xFF, 0x70]);
        assert_eq!(c.r[0], 0x12);
        assert_eq!(c.x, 0x12FF);
    }

    #[test]
    fn io_ports() {
        // IN A,#$0F ; OUT #1,A ; HLT
        let (c, m) = run(&[0x60, 0, 0x0F, 0x61, 0, 1, 0x70]);
        assert_eq!(c.r[0], 0xF0);
        assert_eq!(m.1, vec![0xF0]);
    }

    #[test]
    fn illegal_opcode_traps() {
        let mut m = Ram(vec![0; 65536], vec![]);
        m.0[0xFFE0..0xFFE2].copy_from_slice(&[0x00, 0x01]);
        m.0[0xFFE4..0xFFE6].copy_from_slice(&[0x00, 0x02]);
        m.0[0x100] = 0xFF;
        let mut c = Cpu::default();
        c.reset(&mut m);
        c.sp = 0xE000;
        assert_eq!(c.step(&mut m), Err(Trap::Illegal { at: 0x100, op: 0xFF }));
        assert_eq!(c.pc, 0x200);
    }
}
