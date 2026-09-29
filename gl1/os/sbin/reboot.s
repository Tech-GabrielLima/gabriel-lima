.include "inc/gl1.inc"
        .relocatable
start:  CALL getuid
        TST A
        JNZ .no
        MOV B, #2
        SYS SYS_POWER
        MOV B, #0
        SYS SYS_EXIT
.no:    LDW X, #m_no
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.include "lib/libgl.s"
.include "lib/user.s"
        MSG m_no, "reboot: only root restarts the projector.\n", "reboot: só o root reinicia o projetor.\n"
