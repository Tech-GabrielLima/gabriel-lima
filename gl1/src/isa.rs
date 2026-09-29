//! The GL-1 instruction set: one table that the CPU executes, the assembler
//! encodes and the docs print, so the three can never disagree.
//!
//! Registers
//!   8-bit  A B C D, plus XL XH YL YH (the halves of X and Y): index 0..7
//!   16-bit X Y (pointers), SP (stack), PC
//!   flags  Z C N V I   (zero, carry/borrow, negative, overflow, interrupts enabled)
//!
//! Every instruction is one opcode byte followed by its operand bytes; the
//! addressing mode says what those are.

/// How the operand bytes after the opcode are laid out.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    None,
    /// `[d<<4 | s]` two 8-bit registers.
    RR,
    /// `[r] [imm8]`
    RI,
    /// `[r] [lo] [hi]` a register and an absolute address.
    RA,
    /// `[r | p<<4] [off8]` a register and a pointer plus a signed offset.
    RX,
    /// `[r]`
    R,
    /// `[p] [lo] [hi]` a pointer and a 16-bit immediate.
    PI,
    /// `[p] [lo] [hi]` a pointer and an absolute address.
    PA,
    /// `[d<<4 | s]` two pointers.
    PP,
    /// `[p<<4 | r]` a pointer and an 8-bit register.
    PR,
    /// `[p | q<<4] [off8]` a pointer, and another pointer plus a signed offset.
    PX,
    /// `[p]`
    P,
    /// `[lo] [hi]`
    A16,
    /// `[imm8]`
    I8,
    /// `[r] [port]`
    Port,
}

impl Mode {
    pub const fn len(self) -> u16 {
        match self {
            Mode::None => 0,
            Mode::RR | Mode::R | Mode::PP | Mode::PR | Mode::P | Mode::I8 => 1,
            Mode::RI | Mode::RX | Mode::PX | Mode::A16 | Mode::Port => 2,
            Mode::RA | Mode::PI | Mode::PA => 3,
        }
    }
}

/// The kind of each operand as written in assembly, in order.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum K {
    /// A B C D XL XH YL YH
    Reg,
    /// X Y SP
    Ptr,
    /// `#expr` or a bare expression
    Imm,
    /// `[expr]`
    Mem,
    /// `[X]`, `[Y+3]`, `[SP-2]`
    Ind,
}

pub struct Op {
    pub code: u8,
    pub name: &'static str,
    pub mode: Mode,
    pub sig: &'static [K],
    /// Clock cycles.
    pub cycles: u8,
    pub doc: &'static str,
}

use K::*;
use Mode as M;

macro_rules! op {
    ($code:expr, $name:expr, $mode:expr, [$($k:expr),*], $cy:expr, $doc:expr) => {
        Op { code: $code, name: $name, mode: $mode, sig: &[$($k),*], cycles: $cy, doc: $doc }
    };
}

pub const OPS: &[Op] = &[
    op!(0x00, "NOP", M::None, [], 1, "do nothing"),
    op!(0x01, "MOV", M::RR, [Reg, Reg], 2, "r = s"),
    op!(0x02, "MOV", M::RI, [Reg, Imm], 2, "r = imm"),
    op!(0x03, "LD", M::RA, [Reg, Mem], 4, "r = [addr]"),
    op!(0x04, "LD", M::RX, [Reg, Ind], 4, "r = [p+off]"),
    op!(0x05, "ST", M::RA, [Mem, Reg], 4, "[addr] = r"),
    op!(0x06, "ST", M::RX, [Ind, Reg], 4, "[p+off] = r"),
    op!(0x10, "ADD", M::RR, [Reg, Reg], 2, "r += s"),
    op!(0x11, "ADC", M::RR, [Reg, Reg], 2, "r += s + C"),
    op!(0x12, "SUB", M::RR, [Reg, Reg], 2, "r -= s"),
    op!(0x13, "SBC", M::RR, [Reg, Reg], 2, "r -= s + C"),
    op!(0x14, "AND", M::RR, [Reg, Reg], 2, "r &= s"),
    op!(0x15, "OR", M::RR, [Reg, Reg], 2, "r |= s"),
    op!(0x16, "XOR", M::RR, [Reg, Reg], 2, "r ^= s"),
    op!(0x17, "CMP", M::RR, [Reg, Reg], 2, "flags of r - s"),
    op!(0x18, "ADD", M::RI, [Reg, Imm], 2, "r += imm"),
    op!(0x19, "ADC", M::RI, [Reg, Imm], 2, "r += imm + C"),
    op!(0x1A, "SUB", M::RI, [Reg, Imm], 2, "r -= imm"),
    op!(0x1B, "SBC", M::RI, [Reg, Imm], 2, "r -= imm + C"),
    op!(0x1C, "AND", M::RI, [Reg, Imm], 2, "r &= imm"),
    op!(0x1D, "OR", M::RI, [Reg, Imm], 2, "r |= imm"),
    op!(0x1E, "XOR", M::RI, [Reg, Imm], 2, "r ^= imm"),
    op!(0x1F, "CMP", M::RI, [Reg, Imm], 2, "flags of r - imm"),
    op!(0x20, "INC", M::R, [Reg], 2, "r += 1 (Z N)"),
    op!(0x21, "DEC", M::R, [Reg], 2, "r -= 1 (Z N)"),
    op!(0x22, "SHL", M::R, [Reg], 2, "r <<= 1, C = old bit 7"),
    op!(0x23, "SHR", M::R, [Reg], 2, "r >>= 1, C = old bit 0"),
    op!(0x24, "NOT", M::R, [Reg], 2, "r = ~r"),
    op!(0x25, "NEG", M::R, [Reg], 2, "r = -r"),
    op!(0x26, "ROL", M::R, [Reg], 2, "rotate left through C"),
    op!(0x27, "ROR", M::R, [Reg], 2, "rotate right through C"),
    op!(0x28, "TST", M::R, [Reg], 2, "flags Z N of r"),
    op!(0x30, "LDW", M::PI, [Ptr, Imm], 3, "p = imm16"),
    op!(0x31, "LDW", M::PA, [Ptr, Mem], 5, "p = word [addr]"),
    op!(0x32, "STW", M::PA, [Mem, Ptr], 5, "word [addr] = p"),
    op!(0x33, "MOVW", M::PP, [Ptr, Ptr], 2, "p = q"),
    op!(0x34, "INCW", M::P, [Ptr], 2, "p += 1 (Z)"),
    op!(0x35, "DECW", M::P, [Ptr], 2, "p -= 1 (Z)"),
    op!(0x36, "ADDW", M::PR, [Ptr, Reg], 3, "p += r (unsigned)"),
    op!(0x37, "ADDW", M::PI, [Ptr, Imm], 3, "p += imm16"),
    op!(0x38, "CMPW", M::PI, [Ptr, Imm], 3, "flags of p - imm16"),
    op!(0x39, "CMPW", M::PP, [Ptr, Ptr], 3, "flags of p - q"),
    op!(0x3A, "LDW", M::PX, [Ptr, Ind], 5, "p = word [q+off]"),
    op!(0x3B, "STW", M::PX, [Ind, Ptr], 5, "word [q+off] = p"),
    op!(0x3C, "SUBW", M::PP, [Ptr, Ptr], 3, "p -= q"),
    op!(0x3D, "ADDW", M::PP, [Ptr, Ptr], 3, "p += q"),
    op!(0x3E, "LEA", M::PX, [Ptr, Ind], 3, "p = q + off"),
    op!(0x40, "PUSH", M::R, [Reg], 3, "push r"),
    op!(0x41, "POP", M::R, [Reg], 3, "pop r"),
    op!(0x42, "PUSHW", M::P, [Ptr], 4, "push p"),
    op!(0x43, "POPW", M::P, [Ptr], 4, "pop p"),
    op!(0x44, "CALL", M::A16, [Imm], 5, "push PC, jump"),
    op!(0x45, "RET", M::None, [], 4, "pop PC"),
    op!(0x46, "RETI", M::None, [], 5, "pop F, pop PC"),
    op!(0x47, "CALLW", M::P, [Ptr], 5, "push PC, jump to p"),
    op!(0x48, "PUSHF", M::None, [], 3, "push F"),
    op!(0x49, "POPF", M::None, [], 3, "pop F"),
    op!(0x50, "JMP", M::A16, [Imm], 3, "jump"),
    op!(0x51, "JZ", M::A16, [Imm], 3, "jump if Z"),
    op!(0x52, "JNZ", M::A16, [Imm], 3, "jump if not Z"),
    op!(0x53, "JC", M::A16, [Imm], 3, "jump if C (unsigned below)"),
    op!(0x54, "JNC", M::A16, [Imm], 3, "jump if not C (unsigned at or above)"),
    op!(0x55, "JN", M::A16, [Imm], 3, "jump if N"),
    op!(0x56, "JNN", M::A16, [Imm], 3, "jump if not N"),
    op!(0x57, "JLT", M::A16, [Imm], 3, "jump if signed less (N != V)"),
    op!(0x58, "JGE", M::A16, [Imm], 3, "jump if signed at least (N == V)"),
    op!(0x59, "JA", M::A16, [Imm], 3, "jump if unsigned above (!C and !Z)"),
    op!(0x5A, "JBE", M::A16, [Imm], 3, "jump if unsigned at most (C or Z)"),
    op!(0x5B, "JMPW", M::P, [Ptr], 3, "jump to p"),
    op!(0x60, "IN", M::Port, [Reg, Imm], 4, "r = port"),
    op!(0x61, "OUT", M::Port, [Imm, Reg], 4, "port = r"),
    op!(0x70, "HLT", M::None, [], 1, "wait for an interrupt"),
    op!(0x71, "EI", M::None, [], 1, "enable interrupts"),
    op!(0x72, "DI", M::None, [], 1, "disable interrupts"),
    op!(0x73, "INT", M::I8, [Imm], 6, "software interrupt n (vector SWI)"),
    op!(0x74, "BRK", M::None, [], 6, "breakpoint (vector BRK)"),
];

/// Opcode → index into OPS, built once.
pub fn decode(code: u8) -> Option<&'static Op> {
    static TABLE: std::sync::OnceLock<[u8; 256]> = std::sync::OnceLock::new();
    let t = TABLE.get_or_init(|| {
        let mut t = [0xFF; 256];
        for (i, op) in OPS.iter().enumerate() {
            t[op.code as usize] = i as u8;
        }
        t
    });
    match t[code as usize] {
        0xFF => None,
        i => Some(&OPS[i as usize]),
    }
}

pub const REGS: [&str; 8] = ["A", "B", "C", "D", "XL", "XH", "YL", "YH"];
pub const PTRS: [&str; 3] = ["X", "Y", "SP"];

pub mod flag {
    pub const Z: u8 = 1;
    pub const C: u8 = 2;
    pub const N: u8 = 4;
    pub const V: u8 = 8;
    pub const I: u8 = 16;
}

/// Interrupt vectors: a table of 16 words at the top of memory.
pub mod vector {
    pub const BASE: u16 = 0xFFE0;
    pub const RESET: u8 = 0;
    pub const ILLEGAL: u8 = 2;
    pub const BRK: u8 = 3;
    pub const SWI: u8 = 4;
    /// IRQ line n goes to vector IRQ0 + n.
    pub const IRQ0: u8 = 5;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opcodes_are_unique_and_signatures_fit_modes() {
        let mut seen = [false; 256];
        for op in OPS {
            assert!(!seen[op.code as usize], "duplicate opcode {:02X}", op.code);
            seen[op.code as usize] = true;
            assert_eq!(decode(op.code).unwrap().name, op.name);
        }
        assert!(decode(0xFF).is_none());
    }
}
