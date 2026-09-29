.include "inc/gl1.inc"
        .relocatable
start:  CALL skipsp
        LD A, [X]
        TST A
        JZ .done
        STW [p], X
        MOV B, #2
        SYS SYS_OPEN
        TST A
        JNZ .fail
        MOV B, XL
        SYS SYS_CLOSE
.done:  MOV B, #0
        SYS SYS_EXIT
.fail:  LDW X, #s
        CALL puts
        LDW X, [p]
        CALL puts
        LDW X, #m_perm
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
s:      .db "touch: ", 0
p:      .dw 0
.include "lib/libgl.s"
        MSG m_perm, ": permission denied\n", ": permissão negada\n"
