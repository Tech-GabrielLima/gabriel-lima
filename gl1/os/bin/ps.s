; ps   the processes (all of them: this is a small machine)

.include "inc/gl1.inc"
        .relocatable

start:
        LDW X, #head
        CALL puts
        MOV A, #0
        ST [idx], A
.l:     LD B, [idx]
        LDW Y, #info
        SYS SYS_PROC
        TST A
        JNZ .end
        LD A, [info + PI_STATE]
        TST A
        JZ .n
        MOV XH, #0
        LD A, [info + PI_PID]
        MOV XL, A
        MOV C, #5
        CALL putdecw
        MOV XH, #0
        LD A, [info + PI_PPID]
        MOV XL, A
        MOV C, #6
        CALL putdecw
        MOV A, #' '
        CALL putc
        MOV A, #' '
        CALL putc
        LD A, [info + PI_UID]
        CALL username
        MOV C, #10
        CALL putsw
        LD A, [info + PI_STATE]
        LDW X, #st_run
        CMP A, #1
        JZ .st
        LDW X, #st_wait
        CMP A, #3
        JZ .st
        LDW X, #st_sleep
.st:    MOV C, #7
        CALL putsw
        LDW X, #info + PI_NAME
        CALL puts
        CALL newline
.n:     LD A, [idx]
        INC A
        ST [idx], A
        JMP .l
.end:   MOV B, #0
        SYS SYS_EXIT

head:   .db "\e[90m  PID  PPID  USER      STATE  NAME\e[0m\n", 0
st_run: .db "run", 0
st_wait: .db "wait", 0
st_sleep: .db "sleep", 0
idx:    .db 0
info:   .ds 32

.include "lib/libgl.s"
.include "lib/fmt.s"
.include "lib/user.s"
