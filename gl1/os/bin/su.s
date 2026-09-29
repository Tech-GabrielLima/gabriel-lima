.include "inc/gl1.inc"
        .relocatable
start:  LDW X, #m_su
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.include "lib/libgl.s"
        MSG m_su, "su: every terminal here logs in as someone. root's is in the machine room.\n", "su: cada terminal daqui entra como alguém. O do root fica na sala de máquinas.\n"
