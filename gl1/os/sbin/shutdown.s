.include "inc/gl1.inc"
        .relocatable
start:  LDW X, #m_no
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.include "lib/libgl.s"
        MSG m_no, "No.\n", "Não.\n"
