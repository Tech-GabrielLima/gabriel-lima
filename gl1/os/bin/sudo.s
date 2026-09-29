.include "inc/gl1.inc"
        .relocatable
start:  CALL getuid
        TST A
        JNZ .not
        LDW X, #m_root
        CALL putmsg
        MOV B, #0
        SYS SYS_EXIT
.not:   CALL username
        CALL puts
        LDW X, #m_report
        CALL putmsg
        LDW X, #inc
        CALL host
        LDW X, #frame
        CALL host
        MOV B, #1
        SYS SYS_EXIT
inc:    .db "incident sudo", 0
frame:  .db "frame sudo", 0
.include "lib/libgl.s"
.include "lib/user.s"
.include "lib/host.s"
        MSG m_root, "You're already root. Why sudo?\n", "Você já é root. Por que sudo?\n"
        MSG m_report, " is not in the sudoers file. This incident will be reported.\n", " não está no arquivo sudoers. Este incidente será reportado.\n"
