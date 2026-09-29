; uname [-a]
.include "inc/gl1.inc"
        .relocatable
start:  CALL skipsp
        LD A, [X]
        CMP A, #'-'
        JZ .all
        LDW X, #short
        JMP .p
.all:   LDW X, #long1
        CALL puts
        CALL getuid
        CMP A, #3
        JC .h
        MOV A, #1
.h:     SHL A
        LDW X, #hosts
        ADDW X, A
        LDW X, [X]
        CALL puts
        LDW X, #long2
.p:     CALL puts
        MOV B, #0
        SYS SYS_EXIT
short:  .db "GL-OS\n", 0
long1:  .db "GL-OS ", 0
long2:  .db " 0.1 gl1 GL-1 8-bit 8 MHz\n", 0
hosts:  .dw h0, h1, h2
h0:     .db "maquinas", 0
h1:     .db "cabine", 0
h2:     .db "bilheteria", 0
.include "lib/libgl.s"
.include "lib/user.s"
