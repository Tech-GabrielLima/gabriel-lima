; grep PATTERN [file]   lines that contain PATTERN (from the file or stdin)

.include "inc/gl1.inc"
        .relocatable

start:
        CALL skipsp
        LD A, [X]
        TST A
        JZ .usage
        STW [pat], X
        CALL skipword
        LD A, [X]
        MOV B, #0
        ST [X], B
        TST A
        JZ .stdin
        INCW X
        CALL skipsp
        LD A, [X]
        TST A
        JZ .stdin
        STW [fname], X
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ .nofile
        MOV A, XL
        ST [fd], A
        JMP .go
.stdin: MOV A, #0
        ST [fd], A
.go:    LDW X, #0
        STW [fill], X
        STW [at], X
.line:  ; one line into lbuf
        LDW Y, #lbuf
        MOV C, #0
.ch:    CALL getch
        CMPW X, #1
        JZ .last
        CMP A, #10
        JZ .eol
        CMP C, #200
        JNC .ch
        ST [Y], A
        INCW Y
        INC C
        JMP .ch
.last:  TST C
        JZ .end
        MOV A, #1
        ST [eof], A
.eol:   MOV A, #0
        ST [Y], A
        CALL match
        LD A, [eof]
        TST A
        JZ .line
.end:   LD B, [found]
        MOV A, #1
        SUB A, B
        MOV B, A
        SYS SYS_EXIT
.usage: LDW X, #m_usage
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT
.nofile:
        LDW X, #s_grep
        CALL puts
        LDW X, [fname]
        CALL puts
        LDW X, #m_noent
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT

; The next byte of input → A, X = 1 at the end. Keeps C and Y.
getch:
        PUSHW Y
        PUSH C
        LDW X, [at]
        LDW Y, [fill]
        CMPW X, Y
        JC .have
        LD B, [fd]
        LDW X, #ibuf
        LDW Y, #128
        SYS SYS_READ
        STW [fill], X
        LDW Y, #0
        STW [at], Y
        CMPW X, #0
        JNZ .have
        POP C
        POPW Y
        LDW X, #1
        RET
.have:  LDW X, [at]
        MOVW Y, X
        INCW Y
        STW [at], Y
        ADDW X, #ibuf
        LD A, [X]
        POP C
        POPW Y
        LDW X, #0
        RET

; lbuf contains pat? then print it, the match in colour.
match:
        LDW X, #lbuf
.s:     LD A, [X]
        TST A
        JZ .no
        LDW Y, [pat]
        CALL startswith
        JZ .yes
        INCW X
        JMP .s
.yes:   STW [hit], X
        MOV A, #1
        ST [found], A
        ; before
        LD A, [X]
        ST [save], A
        MOV A, #0
        ST [X], A
        LDW X, #lbuf
        CALL puts
        LDW X, [hit]
        LD A, [save]
        ST [X], A
        LDW X, #c_on
        CALL puts
        ; the match itself
        LDW X, [pat]
        CALL puts
        LDW X, #c_off
        CALL puts
        LDW X, [pat]
        CALL strlen
        LDW X, [hit]
        ADDW X, Y
        CALL puts
        JMP newline
.no:    RET

s_grep: .db "grep: ", 0
c_on:   .db "\e[1;33m", 0
c_off:  .db "\e[0m", 0
pat:    .dw 0
fname:  .dw 0
hit:    .dw 0
fill:   .dw 0
at:     .dw 0
fd:     .db 0
eof:    .db 0
found:  .db 0
save:   .db 0
lbuf:   .ds 202
ibuf:   .ds 128

.include "lib/libgl.s"
        MSG m_usage, "usage: grep PATTERN [FILE]\n", "uso: grep PADRÃO [ARQUIVO]\n"
        MSG m_noent, ": no such file\n", ": arquivo inexistente\n"
