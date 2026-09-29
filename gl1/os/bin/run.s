; run PROGRAM [args]   runs a program by its path (./x.gl, /projects/portfolio.gl)
.include "inc/gl1.inc"
        .relocatable
start:  CALL skipsp
        LD A, [X]
        TST A
        JZ .usage
        STW [prog], X
        CALL skipword
        LD A, [X]
        MOV B, #0
        ST [X], B
        TST A
        JZ .noargs
        INCW X
.noargs:
        MOVW Y, X
        LDW X, [prog]
        MOV C, #$FF
        SYS SYS_EXEC
        TST A
        JNZ .fail
        MOV B, XL
        SYS SYS_EXIT
.fail:  LDW X, #m_fail
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.usage: LDW X, #m_usage
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT
prog:   .dw 0
.include "lib/libgl.s"
        MSG m_usage, "usage: run PROGRAM [ARGS]\n", "uso: run PROGRAMA [ARGS]\n"
        MSG m_fail, "run: can't run that (not found, or not a GL-1 program)\n", "run: não dá para rodar isso (não existe, ou não é um programa da GL-1)\n"
