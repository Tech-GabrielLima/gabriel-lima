.include "inc/gl1.inc"
        .relocatable
start:  CALL getuid
        CALL username
        CALL puts
        CALL newline
        MOV B, #0
        SYS SYS_EXIT
.include "lib/libgl.s"
.include "lib/user.s"
