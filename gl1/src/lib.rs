//! GL-1: the cinema's computer (ROTEIRO §0.4). An 8-bit CPU with a 16-bit
//! address bus, the machine around it (RAM, ROM, VRAM, timer, keyboard,
//! display, disk, interrupt controller, expansion cards, a mailbox to the
//! host), its assembler and its filesystem. GL-OS runs on it.

pub mod cpu;
pub mod isa;
pub mod asm;
pub mod machine;
pub mod glfs;
pub mod glx;
pub mod build;
pub mod headless;
pub mod wasm;
