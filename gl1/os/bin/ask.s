; The commands whose answer lives outside the machine: date (the cinema's
; clock), who / last / write (the other visitors), neofetch (the hardware the
; GL-1 is emulated on). Installed under each of those names; it sends
; "<name> <args>" to the host and prints the reply.

.include "inc/gl1.inc"
        .relocatable

start:
        STW [argp], X
        ; my own name, from the process table
        SYS SYS_GETPID
        MOV A, XL
        CALL proc_by_pid
        LDW X, #msg
        LDW Y, #pinfo + PI_NAME
        CALL strcpy
        MOV A, #' '
        ST [X], A
        INCW X
        LDW Y, [argp]
        CALL strcpy
        LDW X, #msg
        LDW Y, #reply
        MOV C, #<REPLY
        MOV D, #>REPLY
        SYS SYS_HOST
        LDW X, #reply
        CALL puts
        MOV B, #0
        SYS SYS_EXIT

REPLY = 1400
argp:   .dw 0
msg:    .ds 160
reply:  .ds REPLY

.include "lib/libgl.s"
.include "lib/procs.s"
