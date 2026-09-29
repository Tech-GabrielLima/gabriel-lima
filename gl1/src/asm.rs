//! `glasm`, the GL-1 assembler. Two passes over the lines after macros and
//! includes are expanded. Absolute output (`.org`) for the ROM and the kernel,
//! relocatable output for programs: every 16-bit field that holds an address
//! is listed, so the kernel can load a program anywhere (see glx.rs).
//!
//! ```text
//! ; comments
//! NAME = 3 * 4            ; constants (also .equ NAME, expr)
//! start:  MOV A, #10      ; '#' is optional on immediates
//! .loop:  ADD A, B        ; .local labels belong to the last global one
//!         LD  A, [X+2]    ; [X] [Y+n] [SP-n] are indirect, [expr] is absolute
//!         JNZ .loop
//! msg:    .db "hi", 10, 0
//!         .dw start, msg
//!         .ds 16          ; reserve
//! .macro PUTC ch
//!         MOV B, #\ch
//!         MOV A, #1
//!         INT 0
//! .endm
//! ```

use crate::isa::{self, Mode, K, PTRS, REGS};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Error {
    pub file: String,
    pub line: usize,
    pub msg: String,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}:{}: {}", self.file, self.line, self.msg)
    }
}

/// The result of assembling: bytes from `org`, plus what a loader or a debugger needs.
#[derive(Debug, Clone, Default)]
pub struct Program {
    pub org: u16,
    pub bytes: Vec<u8>,
    /// Offsets (from `org`) of 16-bit fields that hold an address of this program.
    pub relocs: Vec<u16>,
    pub symbols: HashMap<String, u16>,
    /// Address → (file, line), for the debugger.
    pub lines: Vec<(u16, String, usize)>,
    /// `.relocatable` was given: the program is built at 0 and moved by the loader.
    pub relocatable: bool,
    /// Bytes to zero after the image (`.bss n`).
    pub bss: u16,
}

#[derive(Clone)]
struct Line {
    text: String,
    file: String,
    no: usize,
}

/// Reads an included file; the assembler never touches the filesystem itself.
pub type Resolver<'a> = &'a dyn Fn(&str) -> Option<String>;

pub fn assemble(name: &str, source: &str, resolve: Resolver) -> Result<Program, Vec<Error>> {
    let mut errors = vec![];
    let mut lines = vec![];
    expand(name, source, resolve, &mut lines, &mut errors, 0);
    if !errors.is_empty() {
        return Err(errors);
    }
    let lines = macros(lines, &mut errors);
    if !errors.is_empty() {
        return Err(errors);
    }
    let mut a = Asm::default();
    // Pass 1 places every label; pass 2 emits with every value known.
    a.pass(&lines, false);
    if a.errors.is_empty() {
        a.pass(&lines, true);
    }
    if !a.errors.is_empty() {
        return Err(a.errors);
    }
    Ok(Program {
        org: a.org,
        bytes: a.out,
        relocs: a.relocs,
        symbols: a.syms.into_iter().map(|(k, v)| (k, v.0 as u16)).collect(),
        lines: a.lines,
        relocatable: a.relocatable,
        bss: a.bss,
    })
}

fn expand(file: &str, src: &str, resolve: Resolver, out: &mut Vec<Line>, errors: &mut Vec<Error>, depth: usize) {
    for (i, raw) in src.lines().enumerate() {
        let t = strip_comment(raw).trim();
        if let Some(rest) = t.strip_prefix(".include") {
            let path = rest.trim().trim_matches('"');
            if depth > 16 {
                errors.push(Error { file: file.into(), line: i + 1, msg: "includes nested too deep".into() });
            } else if let Some(s) = resolve(path) {
                expand(path, &s, resolve, out, errors, depth + 1);
            } else {
                errors.push(Error { file: file.into(), line: i + 1, msg: format!("can't include {path}") });
            }
            continue;
        }
        out.push(Line { text: raw.to_string(), file: file.to_string(), no: i + 1 });
    }
}

struct Macro {
    params: Vec<String>,
    body: Vec<Line>,
}

fn macros(lines: Vec<Line>, errors: &mut Vec<Error>) -> Vec<Line> {
    let mut defs: HashMap<String, Macro> = HashMap::new();
    let mut out = vec![];
    let mut it = lines.into_iter();
    let mut counter = 0usize;
    while let Some(l) = it.next() {
        let t = strip_comment(&l.text).trim().to_string();
        if let Some(rest) = t.strip_prefix(".macro") {
            let mut parts = rest.trim().splitn(2, char::is_whitespace);
            let name = parts.next().unwrap_or("").to_uppercase();
            let params = parts.next().unwrap_or("").split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
            let mut body = vec![];
            let mut closed = false;
            for b in it.by_ref() {
                if strip_comment(&b.text).trim() == ".endm" {
                    closed = true;
                    break;
                }
                body.push(b);
            }
            if !closed {
                errors.push(Error { file: l.file.clone(), line: l.no, msg: format!("macro {name} has no .endm") });
            }
            defs.insert(name, Macro { params, body });
            continue;
        }
        expand_macro_line(l, &defs, &mut out, &mut counter, errors, 0);
    }
    out
}

fn expand_macro_line(l: Line, defs: &HashMap<String, Macro>, out: &mut Vec<Line>, counter: &mut usize, errors: &mut Vec<Error>, depth: usize) {
    let t = strip_comment(&l.text).trim().to_string();
    let (label, rest) = split_label(&t);
    let mut words = rest.splitn(2, char::is_whitespace);
    let head = words.next().unwrap_or("").to_uppercase();
    let Some(m) = defs.get(&head) else {
        out.push(l);
        return;
    };
    if depth > 16 {
        errors.push(Error { file: l.file.clone(), line: l.no, msg: "macros nested too deep".into() });
        return;
    }
    if let Some(label) = label {
        out.push(Line { text: format!("{label}:"), file: l.file.clone(), no: l.no });
    }
    let args = split_operands(words.next().unwrap_or(""));
    *counter += 1;
    let unique = *counter;
    for b in &m.body {
        let mut text = b.text.clone();
        // Longest names first, so \ab isn't eaten by \a.
        let mut ps: Vec<(usize, &String)> = m.params.iter().enumerate().collect();
        ps.sort_by_key(|(_, p)| std::cmp::Reverse(p.len()));
        for (i, p) in ps {
            text = text.replace(&format!("\\{p}"), args.get(i).map(|s| s.as_str()).unwrap_or(""));
        }
        text = text.replace("\\@", &format!("_{unique}"));
        expand_macro_line(Line { text, file: l.file.clone(), no: l.no }, defs, out, counter, errors, depth + 1);
    }
}

fn strip_comment(s: &str) -> &str {
    let mut q: Option<char> = None;
    let mut esc = false;
    for (i, c) in s.char_indices() {
        if esc {
            esc = false;
            continue;
        }
        match (q, c) {
            (Some(_), '\\') => esc = true,
            (Some(x), c) if c == x => q = None,
            (None, '"') | (None, '\'') => q = Some(c),
            (None, ';') => return &s[..i],
            _ => {}
        }
    }
    s
}

/// `name: rest` → (Some(name), rest). A label is an identifier (or .local) followed by ':'.
fn split_label(t: &str) -> (Option<&str>, &str) {
    if let Some(i) = t.find(':') {
        let head = &t[..i];
        if !head.is_empty() && head.chars().enumerate().all(|(j, c)| c.is_alphanumeric() || c == '_' || (j == 0 && c == '.')) {
            return (Some(head), t[i + 1..].trim());
        }
    }
    (None, t)
}

fn split_operands(s: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let (mut depth, mut q, mut esc) = (0i32, None::<char>, false);
    for c in s.chars() {
        if let Some(x) = q {
            cur.push(c);
            if esc {
                esc = false
            } else if c == '\\' {
                esc = true
            } else if c == x {
                q = None
            }
            continue;
        }
        match c {
            '"' | '\'' => {
                q = Some(c);
                cur.push(c)
            }
            '[' | '(' => {
                depth += 1;
                cur.push(c)
            }
            ']' | ')' => {
                depth -= 1;
                cur.push(c)
            }
            ',' if depth == 0 => out.push(std::mem::take(&mut cur).trim().to_string()),
            _ => cur.push(c),
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}

/* ---------------------------------------------------------------- expressions */

/// A value, and whether it's an address inside this (relocatable) program.
#[derive(Clone, Copy, Debug)]
struct Val(i64, bool);

#[derive(Default)]
struct Asm {
    org: u16,
    pc: i64,
    started: bool,
    out: Vec<u8>,
    relocs: Vec<u16>,
    syms: HashMap<String, Val>,
    scope: String,
    errors: Vec<Error>,
    lines: Vec<(u16, String, usize)>,
    relocatable: bool,
    bss: u16,
    emit: bool,
    file: String,
    no: usize,
}

enum Operand {
    Reg(u8),
    Ptr(u8),
    Imm(String),
    Mem(String),
    Ind(u8, String),
}

impl Operand {
    fn kind(&self) -> K {
        match self {
            Operand::Reg(_) => K::Reg,
            Operand::Ptr(_) => K::Ptr,
            Operand::Imm(_) => K::Imm,
            Operand::Mem(_) => K::Mem,
            Operand::Ind(..) => K::Ind,
        }
    }
}

fn reg_index(s: &str) -> Option<u8> {
    REGS.iter().position(|r| r.eq_ignore_ascii_case(s)).map(|i| i as u8)
}
fn ptr_index(s: &str) -> Option<u8> {
    PTRS.iter().position(|r| r.eq_ignore_ascii_case(s)).map(|i| i as u8)
}

fn parse_operand(s: &str) -> Operand {
    let s = s.trim();
    if let Some(inner) = s.strip_prefix('[').and_then(|r| r.strip_suffix(']')) {
        let inner = inner.trim();
        let end = inner.find(|c: char| !c.is_alphanumeric()).unwrap_or(inner.len());
        if let Some(p) = ptr_index(&inner[..end]) {
            let rest = inner[end..].trim();
            if rest.is_empty() {
                return Operand::Ind(p, "0".into());
            }
            if rest.starts_with('+') || rest.starts_with('-') {
                return Operand::Ind(p, format!("0{rest}"));
            }
        }
        return Operand::Mem(inner.to_string());
    }
    if let Some(r) = reg_index(s) {
        return Operand::Reg(r);
    }
    if let Some(p) = ptr_index(s) {
        return Operand::Ptr(p);
    }
    Operand::Imm(s.strip_prefix('#').unwrap_or(s).trim().to_string())
}

impl Asm {
    fn err(&mut self, msg: impl Into<String>) {
        if self.emit || !self.errors.iter().any(|e| e.line == self.no && e.file == self.file) {
            self.errors.push(Error { file: self.file.clone(), line: self.no, msg: msg.into() });
        }
    }

    fn qualify(&self, name: &str) -> String {
        if name.starts_with('.') {
            format!("{}{}", self.scope, name)
        } else {
            name.to_string()
        }
    }

    fn define(&mut self, name: &str, v: Val) {
        let q = self.qualify(name);
        if !name.starts_with('.') {
            self.scope = name.to_string();
        }
        if !self.emit {
            if self.syms.contains_key(&q) {
                self.err(format!("{q} defined twice"));
            }
        }
        self.syms.insert(q, v);
    }

    fn pass(&mut self, lines: &[Line], emit: bool) {
        self.emit = emit;
        self.pc = 0;
        self.org = 0;
        self.started = false;
        self.out.clear();
        self.relocs.clear();
        self.lines.clear();
        self.scope.clear();
        for l in lines {
            self.file = l.file.clone();
            self.no = l.no;
            let t = strip_comment(&l.text).trim().to_string();
            if t.is_empty() {
                continue;
            }
            // NAME = expr
            if let Some((name, expr)) = t.split_once('=') {
                let name = name.trim();
                if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_') && !expr.starts_with('=') {
                    let v = self.eval(expr.trim());
                    self.define(name, v.unwrap_or(Val(0, false)));
                    continue;
                }
            }
            let (label, rest) = split_label(&t);
            if let Some(label) = label {
                let here = Val(self.pc, self.relocatable);
                self.define(label, here);
            }
            if rest.is_empty() {
                continue;
            }
            let mut words = rest.splitn(2, char::is_whitespace);
            let head = words.next().unwrap_or("");
            let args = words.next().unwrap_or("").trim();
            if head.starts_with('.') {
                self.directive(&head.to_lowercase(), args);
            } else {
                self.instruction(&head.to_uppercase(), args);
            }
        }
    }

    fn here(&self) -> u16 {
        self.pc as u16
    }

    fn put(&mut self, b: u8) {
        if !self.started {
            self.started = true;
            self.org = self.pc as u16;
        }
        if self.emit {
            let i = (self.pc - self.org as i64) as usize;
            if self.out.len() < i {
                self.out.resize(i, 0);
            }
            self.out.push(b);
        }
        self.pc += 1;
    }

    fn put16(&mut self, v: Val) {
        if v.1 && self.relocatable && self.emit {
            self.relocs.push(self.here() - self.org);
        }
        self.put(v.0 as u8);
        self.put((v.0 >> 8) as u8);
    }

    fn directive(&mut self, d: &str, args: &str) {
        match d {
            ".org" => match self.eval(args) {
                Some(v) if !self.started || v.0 >= self.pc => self.pc = v.0,
                Some(_) => self.err(".org can't go backwards"),
                None => self.err(".org needs a value known in the first pass"),
            },
            ".relocatable" => {
                self.relocatable = true;
                self.pc = 0;
            }
            ".equ" => {
                let p = split_operands(args);
                if p.len() != 2 {
                    return self.err(".equ NAME, value");
                }
                let v = self.eval(&p[1]).unwrap_or(Val(0, false));
                let name = p[0].clone();
                self.define(&name, v);
            }
            ".db" | ".byte" => {
                for item in split_operands(args) {
                    if item.starts_with('"') {
                        match unquote(&item) {
                            Some(bytes) => bytes.into_iter().for_each(|b| self.put(b)),
                            None => self.err(format!("bad string {item}")),
                        }
                    } else {
                        let v = self.eval_emit(&item);
                        if !(-128..=255).contains(&v.0) {
                            self.err(format!("{item} doesn't fit in a byte"));
                        }
                        self.put(v.0 as u8);
                    }
                }
            }
            ".dw" | ".word" => {
                for item in split_operands(args) {
                    let v = self.eval_emit(&item);
                    self.put16(v);
                }
            }
            ".ds" | ".space" => {
                let p = split_operands(args);
                let n = p.first().and_then(|e| self.eval(e)).map(|v| v.0).unwrap_or(-1);
                if n < 0 {
                    return self.err(".ds needs a size known in the first pass");
                }
                let fill = p.get(1).map(|e| self.eval_emit(e).0 as u8).unwrap_or(0);
                for _ in 0..n {
                    self.put(fill);
                }
            }
            ".align" => {
                let n = self.eval(args).map(|v| v.0).unwrap_or(1).max(1);
                while self.pc % n != 0 {
                    self.put(0);
                }
            }
            ".bss" => {
                let n = self.eval(args).map(|v| v.0).unwrap_or(-1);
                if !(0..=0xFFFF).contains(&n) {
                    return self.err(".bss needs a size known in the first pass");
                }
                self.bss = n as u16;
            }
            _ => self.err(format!("unknown directive {d}")),
        }
    }

    fn instruction(&mut self, name: &str, args: &str) {
        let ops: Vec<Operand> = split_operands(args).iter().map(|s| parse_operand(s)).collect();
        let kinds: Vec<K> = ops.iter().map(|o| o.kind()).collect();
        let Some(op) = isa::OPS.iter().find(|o| o.name == name && o.sig == kinds.as_slice()) else {
            if isa::OPS.iter().any(|o| o.name == name) {
                return self.err(format!("{name} doesn't take {}", describe(&kinds)));
            }
            return self.err(format!("unknown instruction {name}"));
        };
        let start = self.here();
        if self.emit {
            self.lines.push((start, self.file.clone(), self.no));
        }
        self.put(op.code);
        let reg = |ops: &[Operand]| ops.iter().find_map(|o| if let Operand::Reg(r) = o { Some(*r) } else { None }).unwrap_or(0);
        let regs = |ops: &[Operand]| ops.iter().filter_map(|o| if let Operand::Reg(r) = o { Some(*r) } else { None }).collect::<Vec<_>>();
        let ptrs = |ops: &[Operand]| ops.iter().filter_map(|o| if let Operand::Ptr(p) = o { Some(*p) } else { None }).collect::<Vec<_>>();
        let expr = |ops: &[Operand]| {
            ops.iter()
                .find_map(|o| match o {
                    Operand::Imm(e) | Operand::Mem(e) => Some(e.clone()),
                    _ => None,
                })
                .unwrap_or_default()
        };
        let ind = |ops: &[Operand]| ops.iter().find_map(|o| if let Operand::Ind(p, e) = o { Some((*p, e.clone())) } else { None }).unwrap();
        match op.mode {
            Mode::None => {}
            Mode::RR => {
                let r = regs(&ops);
                self.put(r[0] << 4 | r[1]);
            }
            Mode::R => self.put(reg(&ops)),
            Mode::RI => {
                self.put(reg(&ops));
                let e = expr(&ops);
                let v = self.eval_emit(&e);
                self.byte(v, &e);
            }
            Mode::RA => {
                self.put(reg(&ops));
                let v = self.eval_emit(&expr(&ops));
                self.put16(v);
            }
            Mode::RX => {
                let (p, e) = ind(&ops);
                self.put(reg(&ops) | p << 4);
                let v = self.eval_emit(&e);
                self.offset(v);
            }
            Mode::PI | Mode::PA => {
                self.put(ptrs(&ops)[0]);
                let v = self.eval_emit(&expr(&ops));
                self.put16(v);
            }
            Mode::PP => {
                let p = ptrs(&ops);
                self.put(p[0] << 4 | p[1]);
            }
            Mode::PR => self.put(ptrs(&ops)[0] << 4 | reg(&ops)),
            Mode::PX => {
                let (q, e) = ind(&ops);
                self.put(ptrs(&ops)[0] | q << 4);
                let v = self.eval_emit(&e);
                self.offset(v);
            }
            Mode::P => self.put(ptrs(&ops)[0]),
            Mode::A16 => {
                let v = self.eval_emit(&expr(&ops));
                self.put16(v);
            }
            Mode::I8 => {
                let e = expr(&ops);
                let v = self.eval_emit(&e);
                self.byte(v, &e);
            }
            Mode::Port => {
                self.put(reg(&ops));
                let e = expr(&ops);
                let v = self.eval_emit(&e);
                self.byte(v, &e);
            }
        }
    }

    fn byte(&mut self, v: Val, e: &str) {
        if v.1 && self.relocatable {
            self.err(format!("{e} is an address of a relocatable program: take it into a pointer instead"));
        }
        if !(-128..=255).contains(&v.0) {
            self.err(format!("{e} = {} doesn't fit in a byte", v.0));
        }
        self.put(v.0 as u8);
    }

    fn offset(&mut self, v: Val) {
        if !(-128..=127).contains(&v.0) {
            self.err(format!("offset {} out of range (-128..127)", v.0));
        }
        self.put(v.0 as u8);
    }

    /// In pass 1 unknown symbols are fine (they're placed later); in pass 2 they're errors.
    fn eval_emit(&mut self, e: &str) -> Val {
        match self.eval(e) {
            Some(v) => v,
            None => {
                if self.emit {
                    self.err(format!("can't evaluate {e}"));
                }
                Val(0, false)
            }
        }
    }

    fn eval(&mut self, e: &str) -> Option<Val> {
        let toks = tokenize(e)?;
        let mut p = Parser { t: &toks, i: 0, a: self };
        let v = p.or()?;
        if p.i != toks.len() {
            return None;
        }
        Some(v)
    }
}

fn describe(k: &[K]) -> String {
    if k.is_empty() {
        return "no operands".into();
    }
    k.iter().map(|k| format!("{k:?}").to_lowercase()).collect::<Vec<_>>().join(", ")
}

fn unquote(s: &str) -> Option<Vec<u8>> {
    let inner = s.strip_prefix('"')?.strip_suffix('"')?;
    let mut out = vec![];
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            out.push(match chars.next()? {
                'n' => b'\n',
                't' => b'\t',
                'r' => b'\r',
                '0' => 0,
                'e' => 27,
                'b' => 8,
                '\\' => b'\\',
                '"' => b'"',
                '\'' => b'\'',
                _ => return None,
            });
        } else {
            let mut buf = [0; 4];
            out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
        }
    }
    Some(out)
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(i64),
    Id(String),
    Here,
    Op(&'static str),
}

fn tokenize(s: &str) -> Option<Vec<Tok>> {
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut out = vec![];
    while i < b.len() {
        let c = b[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c == '$' && !b.get(i + 1).is_some_and(|c| c.is_ascii_hexdigit()) {
            out.push(Tok::Here);
            i += 1;
            continue;
        }
        if c == '\'' {
            // 'c' or '\n'
            let (v, n) = match (b.get(i + 1), b.get(i + 2), b.get(i + 3)) {
                (Some('\\'), Some(e), Some('\'')) => (unquote(&format!("\"\\{e}\""))?[0] as i64, 4),
                (Some(ch), Some('\''), _) => (*ch as i64, 3),
                _ => return None,
            };
            out.push(Tok::Num(v));
            i += n;
            continue;
        }
        if c.is_ascii_digit() || c == '$' || (c == '%' && b.get(i + 1).is_some_and(|c| *c == '0' || *c == '1') && !matches!(out.last(), Some(Tok::Num(_) | Tok::Id(_) | Tok::Here))) {
            let (radix, start) = if c == '$' {
                (16, i + 1)
            } else if c == '%' {
                (2, i + 1)
            } else if c == '0' && matches!(b.get(i + 1), Some('x') | Some('X')) {
                (16, i + 2)
            } else if c == '0' && matches!(b.get(i + 1), Some('b') | Some('B')) {
                (2, i + 2)
            } else {
                (10, i)
            };
            let mut j = start;
            while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == '_') {
                j += 1;
            }
            let digits: String = b[start..j].iter().filter(|c| **c != '_').collect();
            out.push(Tok::Num(i64::from_str_radix(&digits, radix).ok()?));
            i = j;
            continue;
        }
        if c.is_alphabetic() || c == '_' || c == '.' {
            let mut j = i + 1;
            while j < b.len() && (b[j].is_alphanumeric() || b[j] == '_' || b[j] == '.') {
                j += 1;
            }
            out.push(Tok::Id(b[i..j].iter().collect()));
            i = j;
            continue;
        }
        let two: String = b[i..(i + 2).min(b.len())].iter().collect();
        let op = ["<<", ">>"].into_iter().find(|o| *o == two);
        if let Some(o) = op {
            out.push(Tok::Op(o));
            i += 2;
            continue;
        }
        let one = ["+", "-", "*", "/", "%", "&", "|", "^", "~", "(", ")", "<", ">"].into_iter().find(|o| o.starts_with(c))?;
        out.push(Tok::Op(one));
        i += 1;
    }
    Some(out)
}

struct Parser<'a, 'b> {
    t: &'a [Tok],
    i: usize,
    a: &'b mut Asm,
}

impl Parser<'_, '_> {
    fn peek(&self) -> Option<&Tok> {
        self.t.get(self.i)
    }
    fn eat(&mut self, o: &str) -> bool {
        if self.peek() == Some(&Tok::Op(match o {
            "+" => "+",
            "-" => "-",
            "*" => "*",
            "/" => "/",
            "%" => "%",
            "&" => "&",
            "|" => "|",
            "^" => "^",
            "~" => "~",
            "(" => "(",
            ")" => ")",
            "<" => "<",
            ">" => ">",
            "<<" => "<<",
            _ => ">>",
        })) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn bin(&mut self, ops: &[&str], next: fn(&mut Self) -> Option<Val>) -> Option<Val> {
        let mut l = next(self)?;
        'outer: loop {
            for o in ops {
                if self.eat(o) {
                    let r = next(self)?;
                    l = match *o {
                        "+" => Val(l.0 + r.0, l.1 || r.1),
                        // A difference of two addresses is a plain number.
                        "-" => Val(l.0 - r.0, l.1 && !r.1),
                        "*" => Val(l.0 * r.0, false),
                        "/" => Val(if r.0 == 0 { return None } else { l.0 / r.0 }, false),
                        "%" => Val(if r.0 == 0 { return None } else { l.0 % r.0 }, false),
                        "&" => Val(l.0 & r.0, false),
                        "|" => Val(l.0 | r.0, false),
                        "^" => Val(l.0 ^ r.0, false),
                        "<<" => Val(l.0 << (r.0 & 63), false),
                        _ => Val(l.0 >> (r.0 & 63), false),
                    };
                    continue 'outer;
                }
            }
            return Some(l);
        }
    }
    fn or(&mut self) -> Option<Val> {
        self.bin(&["|"], Self::xor)
    }
    fn xor(&mut self) -> Option<Val> {
        self.bin(&["^"], Self::and)
    }
    fn and(&mut self) -> Option<Val> {
        self.bin(&["&"], Self::shift)
    }
    fn shift(&mut self) -> Option<Val> {
        self.bin(&["<<", ">>"], Self::sum)
    }
    fn sum(&mut self) -> Option<Val> {
        self.bin(&["+", "-"], Self::product)
    }
    fn product(&mut self) -> Option<Val> {
        self.bin(&["*", "/", "%"], Self::unary)
    }
    fn unary(&mut self) -> Option<Val> {
        if self.eat("-") {
            let v = self.unary()?;
            return Some(Val(-v.0, false));
        }
        if self.eat("~") {
            let v = self.unary()?;
            return Some(Val(!v.0 & 0xFFFF, false));
        }
        // <expr low byte, >expr high byte
        if self.eat("<") {
            let v = self.unary()?;
            return Some(Val(v.0 & 0xFF, v.1));
        }
        if self.eat(">") {
            let v = self.unary()?;
            return Some(Val((v.0 >> 8) & 0xFF, v.1));
        }
        self.atom()
    }
    fn atom(&mut self) -> Option<Val> {
        match self.t.get(self.i)?.clone() {
            Tok::Num(n) => {
                self.i += 1;
                Some(Val(n, false))
            }
            Tok::Here => {
                self.i += 1;
                Some(Val(self.a.pc, self.a.relocatable))
            }
            Tok::Id(name) => {
                self.i += 1;
                let q = self.a.qualify(&name);
                self.a.syms.get(&q).copied()
            }
            Tok::Op("(") => {
                self.i += 1;
                let v = self.or()?;
                self.eat(")").then_some(v)
            }
            _ => None,
        }
    }
}

/// One instruction as text, for listings and the debugger. Returns (text, length).
pub fn disassemble(mem: &[u8], at: u16) -> (String, u16) {
    let get = |i: u16| mem.get(at.wrapping_add(i) as usize).copied().unwrap_or(0);
    let Some(op) = isa::decode(get(0)) else {
        return (format!(".db ${:02X}", get(0)), 1);
    };
    let a = get(1);
    let b = get(2);
    let w = a as u16 | (b as u16) << 8;
    let w2 = b as u16 | (get(3) as u16) << 8;
    let r = |i: u8| REGS.get(i as usize).copied().unwrap_or("?");
    let p = |i: u8| PTRS.get(i as usize).copied().unwrap_or("?");
    let ind = |base: u8, off: u8| {
        let o = off as i8;
        match o {
            0 => format!("[{}]", p(base)),
            o if o > 0 => format!("[{}+{}]", p(base), o),
            o => format!("[{}{}]", p(base), o),
        }
    };
    let args = match (op.mode, op.sig.first()) {
        (Mode::None, _) => String::new(),
        (Mode::RR, _) => format!("{}, {}", r(a >> 4), r(a & 15)),
        (Mode::RI, _) => format!("{}, #{}", r(a), b),
        (Mode::RA, Some(K::Reg)) => format!("{}, [${:04X}]", r(a), w2),
        (Mode::RA, _) => format!("[${:04X}], {}", w2, r(a)),
        (Mode::RX, Some(K::Reg)) => format!("{}, {}", r(a & 15), ind(a >> 4, b)),
        (Mode::RX, _) => format!("{}, {}", ind(a >> 4, b), r(a & 15)),
        (Mode::R, _) => r(a).to_string(),
        (Mode::PI, _) => format!("{}, #${:04X}", p(a), w2),
        (Mode::PA, Some(K::Ptr)) => format!("{}, [${:04X}]", p(a), w2),
        (Mode::PA, _) => format!("[${:04X}], {}", w2, p(a)),
        (Mode::PP, _) => format!("{}, {}", p(a >> 4), p(a & 15)),
        (Mode::PR, _) => format!("{}, {}", p(a >> 4), r(a & 15)),
        (Mode::PX, Some(K::Ptr)) => format!("{}, {}", p(a & 15), ind(a >> 4, b)),
        (Mode::PX, _) => format!("{}, {}", ind(a >> 4, b), p(a & 15)),
        (Mode::P, _) => p(a).to_string(),
        (Mode::A16, _) => format!("${:04X}", w),
        (Mode::I8, _) => format!("{a}"),
        (Mode::Port, Some(K::Reg)) => format!("{}, #${:02X}", r(a), b),
        (Mode::Port, _) => format!("#${:02X}, {}", b, r(a)),
    };
    let text = if args.is_empty() { op.name.to_string() } else { format!("{:<5} {}", op.name, args) };
    (text, 1 + op.mode.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asm(src: &str) -> Program {
        assemble("t.s", src, &|_| None).unwrap_or_else(|e| panic!("{}", e.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n")))
    }

    #[test]
    fn the_example_from_the_brief() {
        let p = asm(".org $1000\nstart: MOV A, 10\n ADD A, 20\n ST [$8000], A\n JMP start");
        assert_eq!(p.org, 0x1000);
        assert_eq!(p.bytes, vec![0x02, 0, 10, 0x18, 0, 20, 0x05, 0, 0x00, 0x80, 0x50, 0x00, 0x10]);
    }

    #[test]
    fn labels_locals_and_forward_references() {
        let p = asm(".org 0\na: JMP .x\n.x: NOP\nb: JMP .x\n.x: HLT");
        assert_eq!(p.bytes, vec![0x50, 3, 0, 0x00, 0x50, 7, 0, 0x70]);
    }

    #[test]
    fn indirect_and_pointer_forms() {
        let p = asm("LD A, [X+2]\nST [SP-1], B\nLDW Y, [X]\nLEA X, [SP+4]\nADDW X, A\nADDW X, #300\nMOVW Y, X");
        assert_eq!(
            p.bytes,
            vec![0x04, 0x00, 2, 0x06, 0x21, 0xFF, 0x3A, 0x01, 0, 0x3E, 0x20, 4, 0x36, 0x00, 0x37, 0, 0x2C, 0x01, 0x33, 0x10]
        );
    }

    #[test]
    fn data_strings_and_expressions() {
        let p = asm("N = 3*4+1\n.db \"hi\\n\", N, 'x', <$1234, >$1234\n.dw $ + 1");
        assert_eq!(p.bytes, vec![b'h', b'i', 10, 13, b'x', 0x34, 0x12, 8, 0]);
    }

    #[test]
    fn macros_expand_with_unique_labels() {
        let p = asm(".macro TWICE r\n INC \\r\n JMP next\\@\nnext\\@: INC \\r\n.endm\nTWICE A\nTWICE B");
        assert_eq!(p.bytes.len(), 14);
        assert_eq!(p.bytes[2], 0x50);
    }

    #[test]
    fn relocatable_programs_list_their_addresses() {
        let p = asm(".relocatable\nstart: LDW X, #msg\n CALL start\n MOV A, #(end - msg)\n HLT\nmsg: .db \"ok\"\nend:");
        assert!(p.relocatable);
        assert_eq!(p.relocs, vec![2, 5]);
        assert_eq!(p.bytes[9], 2);
    }

    #[test]
    fn errors_point_at_the_line() {
        let e = assemble("t.s", "NOP\nMOV A, X\nFOO", &|_| None).unwrap_err();
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].line, 2);
        assert!(e[1].msg.contains("unknown instruction"));
    }

    #[test]
    fn disassembly_round_trips() {
        let p = asm("LD A, [X+2]\nLDW Y, #$1234\nOUT #$10, B\nJMP $0400");
        let mut at = 0u16;
        let mut out = vec![];
        while (at as usize) < p.bytes.len() {
            let (t, n) = disassemble(&p.bytes, at);
            out.push(t);
            at += n;
        }
        assert_eq!(out, vec!["LD    A, [X+2]", "LDW   Y, #$1234", "OUT   #$10, B", "JMP   $0400"]);
    }
}
