.include "inc/gl1.inc"
        .relocatable
start:  CALL skipsp
        LD A, [X]
        TST A
        JZ .usage
        STW [p], X
        SYS SYS_MKDIR
        TST A
        JNZ .fail
        MOV B, #0
        SYS SYS_EXIT
.fail:  PUSH A
        LDW X, #s
        CALL puts
        LDW X, [p]
        CALL puts
        POP A
        LDW X, #m_exist
        CMP A, #E_EXIST
        JZ .m
        LDW X, #m_perm
        CMP A, #E_PERM
        JZ .m
        LDW X, #m_fail
.m:     CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.usage: LDW X, #m_usage
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT
s:      .db "mkdir: ", 0
p:      .dw 0
.include "lib/libgl.s"
        MSG m_usage, "usage: mkdir DIR\n", "uso: mkdir DIR\n"
        MSG m_exist, ": already exists\n", ": já existe\n"
        MSG m_perm, ": permission denied\n", ": permissão negada\n"
        MSG m_fail, ": can't create it\n", ": não foi possível criar\n"
