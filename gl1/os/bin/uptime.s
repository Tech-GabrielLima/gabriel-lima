.include "inc/gl1.inc"
        .relocatable
start:  SYS SYS_UPTIME
        STW [secs], X
        LDW X, #m_up
        CALL putmsg
        ; minutes and seconds
        LDW X, [secs]
        LDW Y, #0
.m:     CMPW X, #60
        JC .md
        ADDW X, #-60
        INCW Y
        JMP .m
.md:    STW [secs], X
        MOVW X, Y
        CALL putdec
        LDW X, #s_min
        CALL puts
        LDW X, [secs]
        CALL putdec
        LDW X, #s_s
        CALL puts
        ; processes
        MOV A, #0
        ST [n], A
        ST [idx], A
.l:     LD B, [idx]
        LDW Y, #info
        SYS SYS_PROC
        TST A
        JNZ .pd
        LD A, [info]
        TST A
        JZ .nx
        LD A, [n]
        INC A
        ST [n], A
.nx:    LD A, [idx]
        INC A
        ST [idx], A
        JMP .l
.pd:    MOV XH, #0
        LD A, [n]
        MOV XL, A
        CALL putdec
        LDW X, #m_procs
        CALL putmsg
        MOV B, #0
        SYS SYS_EXIT
s_min:  .db " min ", 0
s_s:    .db " s, ", 0
secs:   .dw 0
n:      .db 0
idx:    .db 0
info:   .ds 32
.include "lib/libgl.s"
        MSG m_up, "up ", "no ar há "
        MSG m_procs, " processes\n", " processos\n"
