//! GLFS, the GL-OS filesystem, on 512-byte sectors.
//!
//! ```text
//! sector 0        boot block
//!   0  "GL"  2 version  3 flags
//!   4  kernel sector u16   6 kernel sectors u16   8 load address u16   10 entry u16
//!   12 inode table sector u16   14 inode count u16
//!   16 data sector u16   18 next free sector u16   20 total sectors u16
//!   32 volume label (32 bytes)
//! sector 1..      inode table, 32 bytes per inode, inode 0 is /
//!   0  name (19 chars + NUL)
//!   20 parent inode u16
//!   22 kind: 0 free, 1 file, 2 directory, 3 device
//!   23 owner uid (0 root, 1 visitante, 2 caixa)
//!   24 mode: bit0 others read, bit1 others write, bit2 executable, bit3 hidden
//!   26 size u16   28 first sector u16   30 capacity in sectors u16
//! data            files, each in consecutive sectors
//! ```
//!
//! Directories hold nothing: an inode's parent says where it lives, so
//! listing a directory is a scan of the table. Simple enough to write in
//! assembly, which is the point.

pub const SECTOR: usize = 512;
pub const INODE: usize = 32;
pub const INODES: usize = 512;
pub const NAME: usize = 20;

pub mod kind {
    pub const FREE: u8 = 0;
    pub const FILE: u8 = 1;
    pub const DIR: u8 = 2;
    pub const DEV: u8 = 3;
}

pub mod mode {
    pub const READ: u8 = 1;
    pub const WRITE: u8 = 2;
    pub const EXEC: u8 = 4;
    pub const HIDDEN: u8 = 8;
}

pub const ROOT: u8 = 0;
pub const VISITANTE: u8 = 1;
pub const CAIXA: u8 = 2;

#[derive(Clone, Debug)]
pub struct Entry {
    pub path: String,
    pub kind: u8,
    pub owner: u8,
    pub mode: u8,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Inode {
    pub name: String,
    pub parent: u16,
    pub kind: u8,
    pub owner: u8,
    pub mode: u8,
    pub size: u16,
    pub sector: u16,
    pub capacity: u16,
}

impl Inode {
    fn write(&self, b: &mut [u8]) {
        b.fill(0);
        let n = self.name.as_bytes();
        b[..n.len().min(NAME - 1)].copy_from_slice(&n[..n.len().min(NAME - 1)]);
        b[20..22].copy_from_slice(&self.parent.to_le_bytes());
        b[22] = self.kind;
        b[23] = self.owner;
        b[24] = self.mode;
        b[26..28].copy_from_slice(&self.size.to_le_bytes());
        b[28..30].copy_from_slice(&self.sector.to_le_bytes());
        b[30..32].copy_from_slice(&self.capacity.to_le_bytes());
    }
    fn read(b: &[u8]) -> Inode {
        let end = b[..NAME].iter().position(|c| *c == 0).unwrap_or(NAME);
        let w = |i: usize| u16::from_le_bytes([b[i], b[i + 1]]);
        Inode {
            name: String::from_utf8_lossy(&b[..end]).into(),
            parent: w(20),
            kind: b[22],
            owner: b[23],
            mode: b[24],
            size: w(26),
            sector: w(28),
            capacity: w(30),
        }
    }
}

#[derive(Debug)]
pub struct MkfsError(pub String);

/// Builds a disk image. The kernel is stored as /boot/kernel.sys and the boot
/// block points at it, so the ROM can load it without understanding GLFS.
pub fn mkfs(entries: &[Entry], kernel: &[u8], load: u16, entry: u16, total: u16, label: &str) -> Result<Vec<u8>, MkfsError> {
    let table = 1u16;
    let table_sectors = (INODES * INODE / SECTOR) as u16;
    let data = table + table_sectors;
    let mut img = vec![0u8; total as usize * SECTOR];
    let mut inodes: Vec<Inode> = vec![Inode { name: "/".into(), parent: 0, kind: kind::DIR, owner: ROOT, mode: mode::READ, size: 0, sector: 0, capacity: 0 }];
    let mut next = data;

    let place = |bytes: &[u8], writable: bool, img: &mut Vec<u8>, next: &mut u16| -> Result<(u16, u16), MkfsError> {
        let need = bytes.len().div_ceil(SECTOR).max(1) as u16 + writable as u16;
        let at = *next;
        if at as usize + need as usize > total as usize {
            return Err(MkfsError("disk full".into()));
        }
        img[at as usize * SECTOR..at as usize * SECTOR + bytes.len()].copy_from_slice(bytes);
        *next += need;
        Ok((at, need))
    };

    fn find(inodes: &[Inode], parent: u16, name: &str) -> Option<u16> {
        inodes.iter().enumerate().skip(1).find(|(_, i)| i.parent == parent && i.name == name).map(|(n, _)| n as u16)
    }
    let dir_of = |inodes: &mut Vec<Inode>, parts: &[&str]| -> u16 {
        let mut at = 0u16;
        for p in parts {
            at = match find(inodes, at, p) {
                Some(n) => n,
                None => {
                    inodes.push(Inode { name: p.to_string(), parent: at, kind: kind::DIR, owner: ROOT, mode: mode::READ, size: 0, sector: 0, capacity: 0 });
                    (inodes.len() - 1) as u16
                }
            };
        }
        at
    };

    let mut all: Vec<Entry> = vec![Entry { path: "/boot/kernel.sys".into(), kind: kind::FILE, owner: ROOT, mode: mode::READ, data: kernel.to_vec() }];
    all.extend(entries.iter().cloned());
    let mut kernel_at = (0, 0);
    for e in &all {
        let parts: Vec<&str> = e.path.split('/').filter(|p| !p.is_empty()).collect();
        let Some((name, dirs)) = parts.split_last() else { continue };
        if name.len() >= NAME {
            return Err(MkfsError(format!("{}: name longer than {} characters", e.path, NAME - 1)));
        }
        if e.data.len() > 0xFFFF {
            return Err(MkfsError(format!("{}: bigger than 64 KB", e.path)));
        }
        let parent = dir_of(&mut inodes, dirs);
        let existing = find(&inodes, parent, name);
        if e.kind == kind::DIR {
            // An explicit directory: who owns it and who may write in it.
            let n = dir_of(&mut inodes, &parts);
            inodes[n as usize].owner = e.owner;
            inodes[n as usize].mode = e.mode;
            continue;
        }
        let mut node = Inode { name: name.to_string(), parent, kind: e.kind, owner: e.owner, mode: e.mode, size: 0, sector: 0, capacity: 0 };
        if e.kind == kind::FILE {
            let writable = e.owner != ROOT || e.mode & mode::WRITE != 0;
            let (at, cap) = place(&e.data, writable, &mut img, &mut next)?;
            node.size = e.data.len() as u16;
            node.sector = at;
            node.capacity = cap;
            if e.path == "/boot/kernel.sys" {
                kernel_at = (at, e.data.len().div_ceil(SECTOR) as u16);
            }
        }
        match existing {
            Some(n) => inodes[n as usize] = node,
            None => inodes.push(node),
        }
        if inodes.len() > INODES {
            return Err(MkfsError("too many files".into()));
        }
    }

    let b = &mut img[..SECTOR];
    b[0] = b'G';
    b[1] = b'L';
    b[2] = 1;
    for (i, v) in [kernel_at.0, kernel_at.1, load, entry, table, INODES as u16, data, next, total].iter().enumerate() {
        b[4 + 2 * i..6 + 2 * i].copy_from_slice(&v.to_le_bytes());
    }
    let l = label.as_bytes();
    b[32..32 + l.len().min(31)].copy_from_slice(&l[..l.len().min(31)]);
    for (n, node) in inodes.iter().enumerate() {
        let at = table as usize * SECTOR + n * INODE;
        node.write(&mut img[at..at + INODE]);
    }
    Ok(img)
}

/// Reads an image back (for tests and the CLI).
pub struct Fs<'a> {
    pub img: &'a [u8],
}

impl Fs<'_> {
    pub fn inode(&self, n: u16) -> Inode {
        let at = SECTOR + n as usize * INODE;
        Inode::read(&self.img[at..at + INODE])
    }
    pub fn lookup(&self, path: &str) -> Option<u16> {
        let mut at = 0u16;
        for p in path.split('/').filter(|p| !p.is_empty()) {
            at = (1..INODES as u16).find(|&n| {
                let i = self.inode(n);
                i.kind != kind::FREE && i.parent == at && i.name == p
            })?;
        }
        Some(at)
    }
    pub fn list(&self, dir: u16) -> Vec<Inode> {
        (1..INODES as u16).map(|n| self.inode(n)).filter(|i| i.kind != kind::FREE && i.parent == dir).collect()
    }
    pub fn read(&self, n: u16) -> Vec<u8> {
        let i = self.inode(n);
        let at = i.sector as usize * SECTOR;
        self.img[at..at + i.size as usize].to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_and_reads_back() {
        let e = vec![
            Entry { path: "/etc/motd".into(), kind: kind::FILE, owner: ROOT, mode: mode::READ, data: b"hello".to_vec() },
            Entry { path: "/home/visitante/notes.txt".into(), kind: kind::FILE, owner: VISITANTE, mode: 0, data: vec![b'x'; 600] },
            Entry { path: "/cinema/luz".into(), kind: kind::DEV, owner: ROOT, mode: mode::READ | mode::WRITE, data: vec![] },
        ];
        let img = mkfs(&e, &[0x70; 700], 0x0400, 0x0400, 256, "GL-OS").unwrap();
        let fs = Fs { img: &img };
        assert_eq!(&img[..2], b"GL");
        let motd = fs.lookup("/etc/motd").unwrap();
        assert_eq!(fs.read(motd), b"hello");
        let notes = fs.inode(fs.lookup("/home/visitante/notes.txt").unwrap());
        assert_eq!((notes.size, notes.capacity), (600, 3));
        assert_eq!(fs.inode(fs.lookup("/cinema/luz").unwrap()).kind, kind::DEV);
        let k = u16::from_le_bytes([img[4], img[5]]);
        assert_eq!(img[k as usize * SECTOR], 0x70);
        assert_eq!(fs.list(0).iter().map(|i| i.name.as_str()).collect::<Vec<_>>(), vec!["boot", "etc", "home", "cinema"]);
    }
}

/// GLFS over a live disk (with its overlay): what the host uses to read and
/// write files behind the machine's back (the expansion cards, the site).
/// Every write flags the disk as changed so the kernel drops its sector cache.
pub struct LiveFs<'a> {
    pub disk: &'a mut crate::machine::Disk,
}

impl LiveFs<'_> {
    fn sector(&self, s: u16) -> Vec<u8> {
        self.disk.read(s).unwrap_or_else(|| vec![0; SECTOR])
    }
    fn put(&mut self, s: u16, data: &[u8]) {
        self.disk.write(s, data);
        self.disk.changed = true;
    }
    fn word(&self, at: usize) -> u16 {
        let b = self.sector(0);
        u16::from_le_bytes([b[at], b[at + 1]])
    }
    pub fn inode(&self, n: u16) -> Inode {
        let table = self.word(12);
        let s = self.sector(table + n / 16);
        let at = (n as usize % 16) * INODE;
        Inode::read(&s[at..at + INODE])
    }
    fn set_inode(&mut self, n: u16, i: &Inode) {
        let table = self.word(12);
        let mut s = self.sector(table + n / 16);
        let at = (n as usize % 16) * INODE;
        i.write(&mut s[at..at + INODE]);
        self.put(table + n / 16, &s);
    }
    pub fn lookup(&self, path: &str) -> Option<u16> {
        let mut at = 0u16;
        for p in path.split('/').filter(|p| !p.is_empty()) {
            at = (1..INODES as u16).find(|&n| {
                let i = self.inode(n);
                i.kind != kind::FREE && i.parent == at && i.name == p
            })?;
        }
        Some(at)
    }
    pub fn list(&self, path: &str) -> Option<Vec<Inode>> {
        let dir = self.lookup(path)?;
        Some((1..INODES as u16).map(|n| self.inode(n)).filter(|i| i.kind != kind::FREE && i.parent == dir).collect())
    }
    pub fn read(&self, path: &str) -> Option<Vec<u8>> {
        let i = self.inode(self.lookup(path)?);
        if i.kind != kind::FILE {
            return None;
        }
        let mut out = Vec::with_capacity(i.size as usize);
        let mut s = i.sector;
        while out.len() < i.size as usize {
            let data = self.sector(s);
            let n = (i.size as usize - out.len()).min(SECTOR);
            out.extend_from_slice(&data[..n]);
            s += 1;
        }
        Some(out)
    }
    /// Creates or replaces a file (its parent must exist). New files belong to `owner`.
    pub fn write(&mut self, path: &str, data: &[u8], owner: u8, file_mode: u8) -> Result<(), String> {
        if data.len() > 0xFFFF {
            return Err("bigger than 64 KB".into());
        }
        let (dir, name) = path.rsplit_once('/').ok_or("not an absolute path")?;
        let parent = self.lookup(if dir.is_empty() { "/" } else { dir }).ok_or("no such directory")?;
        if name.is_empty() || name.len() >= NAME {
            return Err("bad name".into());
        }
        let need = data.len().div_ceil(SECTOR).max(1) as u16;
        let existing = self.lookup(path);
        let (n, mut node) = match existing {
            Some(n) => (n, self.inode(n)),
            None => {
                let n = (1..INODES as u16).find(|&n| self.inode(n).kind == kind::FREE).ok_or("no free inode")?;
                (n, Inode { name: name.into(), parent, kind: kind::FILE, owner, mode: file_mode, size: 0, sector: 0, capacity: 0 })
            }
        };
        if node.kind != kind::FILE {
            return Err("not a file".into());
        }
        node.mode |= file_mode & mode::EXEC;
        if node.capacity < need {
            // Room at the end of the disk, like the kernel's k_grow.
            let free = self.word(18);
            let total = self.word(20);
            let cap = need + 2;
            if free as u32 + cap as u32 > total as u32 {
                return Err("disk full".into());
            }
            node.sector = free;
            node.capacity = cap;
            let mut b = self.sector(0);
            b[18..20].copy_from_slice(&(free + cap).to_le_bytes());
            self.put(0, &b);
        }
        for (k, chunk) in data.chunks(SECTOR).enumerate() {
            let mut s = vec![0u8; SECTOR];
            s[..chunk.len()].copy_from_slice(chunk);
            self.put(node.sector + k as u16, &s);
        }
        node.size = data.len() as u16;
        self.set_inode(n, &node);
        Ok(())
    }
}
