; The expansion-card driver. Installed as python, psql, git, vi... (see
; fs.txt): it sends "<its name> <args>" to the card on the bus, streams stdin
; to it when stdin is a file or a pipe, forwards keys (Ctrl+C included) when
; it's the console, and copies what the card says to stdout. The GL-1 does the
; plumbing; the card (a Web Worker in the browser) does the heavy lifting,
; like a SoftCard in an Apple II.

.include "inc/gl1.inc"
        .relocatable

BUS = 1

start:
        STW [argp], X
        MOV A, #BUS
        OUT #P_CARD_SEL, A
        IN A, #P_CARD_STATUS
        AND A, #8
        JZ .absent
        ; the header: P (stdin is a pipe) or T (the console), the directory, then the command
        MOV B, #0
        SYS SYS_ISATTY
        MOV A, #'T'
        CMPW X, #1
        JZ .tty
        MOV A, #'P'
        MOV B, #1
        ST [piped], B
.tty:   OUT #P_CARD_DATA, A
        MOV A, #$1F
        OUT #P_CARD_DATA, A
        LDW X, #buf
        SYS SYS_GETCWD
        LDW X, #buf
        CALL send
        MOV A, #$1F
        OUT #P_CARD_DATA, A
        ; my name, then my arguments
        SYS SYS_GETPID
        MOV A, XL
        CALL proc_by_pid
        LDW X, #pinfo + PI_NAME
        CALL send
        MOV A, #' '
        OUT #P_CARD_DATA, A
        LDW X, [argp]
        CALL send
        MOV A, #1
        OUT #P_CARD_CTRL, A
        ; stdin: a file or a pipe goes to the card whole, then "end of input"
        LD A, [piped]
        TST A
        JZ .pump
.feed:  MOV B, #0
        LDW X, #buf
        LDW Y, #64
        SYS SYS_READ
        CMPW X, #0
        JZ .fed
        LDW Y, #buf
.fb:    LD A, [Y]
        OUT #P_CARD_DATA, A
        INCW Y
        DECW X
        JNZ .fb
        JMP .feed
.fed:   MOV A, #4
        OUT #P_CARD_CTRL, A

.pump:  IN A, #P_CARD_STATUS
        AND A, #1
        JZ .quiet
        ; output: up to 64 bytes at a time
        LDW X, #buf
        LDW Y, #0
.ob:    IN A, #P_CARD_DATA
        ST [X], A
        INCW X
        INCW Y
        CMPW Y, #64
        JNC .flush
        IN A, #P_CARD_STATUS
        AND A, #1
        JNZ .ob
.flush: LDW X, #buf
        MOV B, #1
        SYS SYS_WRITE
        JMP .pump
.quiet: IN A, #P_CARD_STATUS
        AND A, #2
        JZ .done
        ; keys, when the console is stdin
        LD A, [piped]
        TST A
        JNZ .idle
        IN A, #P_CON_STATUS
        TST A
        JZ .idle
        IN A, #P_CON_IN
        CMP A, #3
        JNZ .key
        MOV A, #2
        OUT #P_CARD_CTRL, A
        JMP .pump
.key:   OUT #P_CARD_DATA, A
        JMP .pump
.idle:  SYS SYS_YIELD
        JMP .pump
.done:  IN A, #P_CARD_SEL
        MOV B, A
        SYS SYS_EXIT

.absent:
        LDW X, #m_absent
        CALL putmsg
        MOV B, #127
        SYS SYS_EXIT

; The string at X → the card.
send:   LD A, [X]
        TST A
        JZ .d
        OUT #P_CARD_DATA, A
        INCW X
        JMP send
.d:     RET

argp:   .dw 0
piped:  .db 0
buf:    .ds 64

.include "lib/libgl.s"
.include "lib/procs.s"
        MSG m_absent, "This machine has no expansion card on its bus.\n", "Esta máquina não tem placa de expansão no barramento.\n"
