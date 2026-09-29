; GL-1 / GL-OS shared definitions. Ports mirror src/machine.rs.

; ---------------------------------------------------------------- ports
P_CON_OUT     = $00
P_CON_IN      = $01
P_CON_STATUS  = $02
P_CON_COLS    = $03
P_CON_ROWS    = $04
P_DISP_MODE   = $05
P_DISP_FLIP   = $06
P_TIMER       = $10
P_CLOCK0      = $11
P_CLOCK1      = $12
P_CLOCK2      = $13
P_CLOCK3      = $14
P_UPSEC0      = $15
P_UPSEC1      = $16
P_RTC0        = $18
P_RTC1        = $19
P_RTC2        = $1A
P_RTC3        = $1B
P_RNG         = $1C
P_DISK_SEC_LO = $20
P_DISK_SEC_HI = $21
P_DISK_DMA_LO = $22
P_DISK_DMA_HI = $23
P_DISK_CMD    = $24
P_DISK_STATUS = $25
P_DISK_SIZE_LO = $26
P_DISK_SIZE_HI = $27
P_DISK_CHANGED = $28
P_IRQ_MASK    = $30
P_IRQ_PENDING = $31
P_IRQ_ACK     = $32
P_SWI         = $34
P_CARD_SEL    = $40
P_CARD_DATA   = $41
P_CARD_STATUS = $42
P_CARD_CTRL   = $43
P_HOST_DATA   = $50
P_HOST_STATUS = $51
P_HOST_CTRL   = $52
P_POWER       = $60
P_BOOT_USER   = $61
P_LANG        = $62
P_PAD         = $63
P_TONE        = $64

IRQ_TIMER = 1

; ---------------------------------------------------------------- memory
TRAMPOLINES = $0010     ; 16 x "JMP handler", the ROM vectors land here
KVARS       = $0040     ; kernel variables
SECBUF      = $0100     ; the one sector buffer (512 bytes)
KSCRATCH    = $0300     ; kernel scratch (256 bytes)
KERNEL      = $0400     ; kernel load address
SLOTS       = $3000     ; process memory: 11 slots of 4 KB
SLOT_SIZE   = $1000
SLOT_COUNT  = 11
ARGS_AT     = $0F80     ; offset in a slot: the argument line (128 bytes), stack below it
VRAM        = $E000

; ---------------------------------------------------------------- syscalls (A = number, INT 0)
SYS_EXIT    = 0         ; B = code
SYS_PUTC    = 1         ; B = char (to stdout)
SYS_GETC    = 2         ; -> A = char, X = 1 at end of input
SYS_WRITE   = 3         ; B = fd, X = buf, Y = len -> X = written
SYS_READ    = 4         ; B = fd, X = buf, Y = len -> X = read (0 = end)
SYS_OPEN    = 5         ; X = path, B = 0 read / 1 write / 2 append -> X = fd
SYS_CLOSE   = 6         ; B = fd
SYS_READDIR = 7         ; B = fd of a directory, Y = 32-byte buffer -> A = 1 at the end
SYS_STAT    = 8         ; X = path, Y = 32-byte buffer -> X = inode
SYS_EXEC    = 9         ; X = path, Y = args -> X = exit code
SYS_SPAWN   = 10        ; X = path, Y = args -> X = pid
SYS_KILL    = 11        ; B = pid
SYS_PROC    = 12        ; B = index, Y = 32-byte buffer -> A = 1 past the end
SYS_GETUID  = 13        ; -> X = uid
SYS_CHDIR   = 14        ; X = path
SYS_GETCWD  = 15        ; X = buffer (64 bytes)
SYS_UNLINK  = 16        ; X = path
SYS_UPTIME  = 17        ; -> X = seconds since boot
SYS_HOST    = 18        ; X = message, Y = reply buffer, C:D = its size (low, high) -> X = reply length
SYS_MKDIR   = 19        ; X = path
SYS_SLEEP   = 20        ; X = milliseconds
SYS_ARGS    = 21        ; -> X = the argument line
SYS_GETPID  = 22        ; -> X = pid
SYS_POWER   = 23        ; B = 1 off, 2 reboot, 3 panic
SYS_DUP2    = 24        ; B = from fd, C = to fd
SYS_YIELD   = 25
SYS_TIME    = 26        ; X = 4-byte buffer <- unix time
SYS_ISATTY  = 27        ; B = fd -> X = 1 if it's the console

; Errors in A (0 = fine)
E_OK      = 0
E_NOENT   = 1
E_PERM    = 2
E_NOTDIR  = 3
E_ISDIR   = 4
E_NOEXEC  = 5
E_NOMEM   = 6
E_BADF    = 7
E_EXIST   = 8
E_FULL    = 9
E_BUSY    = 10
E_NOTEMPTY = 11

; stat buffer = the inode (32 bytes)
ST_NAME   = 0
ST_PARENT = 20
ST_KIND   = 22
ST_OWNER  = 23
ST_MODE   = 24
ST_SIZE   = 26
ST_SECTOR = 28
ST_CAP    = 30

K_FREE = 0
K_FILE = 1
K_DIR  = 2
K_DEV  = 3

M_READ   = 1
M_WRITE  = 2
M_EXEC   = 4
M_HIDDEN = 8

UID_ROOT      = 0
UID_VISITANTE = 1
UID_CAIXA     = 2

; process info buffer (SYS_PROC)
PI_STATE = 0
PI_PID   = 1
PI_PPID  = 2
PI_UID   = 3
PI_SLOT  = 4
PI_NAME  = 14           ; 12 bytes

; ---------------------------------------------------------------- macros
.macro SYS num
        MOV A, #\num
        INT 0
.endm

; X += word [var]   (uses A, B)
.macro ADDXM var
        MOV A, XL
        LD B, [\var]
        ADD A, B
        MOV XL, A
        MOV A, XH
        LD B, [\var+1]
        ADC A, B
        MOV XH, A
.endm

; X -= word [var]   (uses A, B; C = borrow)
.macro SUBXM var
        MOV A, XL
        LD B, [\var]
        SUB A, B
        MOV XL, A
        MOV A, XH
        LD B, [\var+1]
        SBC A, B
        MOV XH, A
.endm

; A message in both languages (see putmsg in libgl).
.macro MSG name, en, pt
\name:  .dw msg_en\@, msg_pt\@
msg_en\@: .db \en, 0
msg_pt\@: .db \pt, 0
.endm

HOSTBUF_SIZE = 250
