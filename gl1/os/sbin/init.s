; init, pid 1. Starts the usher and a shell for whoever sits at this
; terminal, and keeps them alive: a shell that exits is started again, and
; the usher, if someone kills him, comes back two minutes later with a new
; PID. Let it crash.

.include "inc/gl1.inc"
        .relocatable

USHER_BACK_S = 120

start:
        LDW X, #usher
        LDW Y, #none
        MOV C, #UID_ROOT
        SYS SYS_SPAWN
        MOV A, XL
        ST [usher_pid], A
        CALL shell

.watch: LDW X, #1000
        SYS SYS_SLEEP
        ; the shell
        LD A, [sh_pid]
        CALL alive
        JZ .sh_ok
        CALL shell
.sh_ok: ; the usher
        LD A, [usher_pid]
        TST A
        JZ .away
        CALL alive
        JZ .watch
        ; gone: start counting
        MOV A, #0
        ST [usher_pid], A
        LDW X, #USHER_BACK_S
        STW [usher_wait], X
        JMP .watch
.away:  LDW X, [usher_wait]
        DECW X
        STW [usher_wait], X
        JNZ .watch
        LDW X, #usher
        LDW Y, #back
        MOV C, #UID_ROOT
        SYS SYS_SPAWN
        MOV A, XL
        ST [usher_pid], A
        JMP .watch

; A login shell for the user this terminal belongs to.
shell:
        IN A, #P_BOOT_USER
        MOV C, A
        LDW X, #sh
        LDW Y, #login
        SYS SYS_SPAWN
        MOV A, XL
        ST [sh_pid], A
        RET

; A = pid → Z set if that process is running.
alive:
        ST [want], A
        MOV A, #0
        ST [idx], A
.l:     LD B, [idx]
        LDW Y, #info
        SYS SYS_PROC
        TST A
        JNZ .no
        LD A, [info + PI_STATE]
        TST A
        JZ .n
        LD A, [info + PI_PID]
        LD B, [want]
        CMP A, B
        JZ .yes
.n:     LD A, [idx]
        INC A
        ST [idx], A
        JMP .l
.yes:   MOV A, #0
        TST A
        RET
.no:    MOV A, #1
        TST A
        RET

usher:      .db "/sbin/lanterninha", 0
sh:         .db "/bin/sh", 0
none:       .db 0
back:       .db "voltei", 0
login:      .db "-l", 0
usher_pid:  .db 0
sh_pid:     .db 0
usher_wait: .dw 0
want:       .db 0
idx:        .db 0
info:       .ds 32
