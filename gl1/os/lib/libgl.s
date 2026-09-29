; libgl: what every GL-OS program links in (by .include, after its code).
; Calling convention: arguments in X Y A, results in X (or A / flags), and
; every register may be clobbered unless the comment says otherwise.

; The string at X → stdout.
puts:
        PUSHW X
        CALL strlen
        POPW X
        MOV B, #1
        SYS SYS_WRITE
        RET

; A → stdout.
putc:
        MOV B, A
        SYS SYS_PUTC
        RET

newline:
        MOV A, #10
        JMP putc

; X as an unsigned decimal number.
putdec:
        MOV D, #0
        LDW Y, #10000
        CALL .digit
        LDW Y, #1000
        CALL .digit
        LDW Y, #100
        CALL .digit
        LDW Y, #10
        CALL .digit
        MOV D, #1
        LDW Y, #1
.digit: MOV C, #'0'
.sub:   CMPW X, Y
        JC .out
        SUBW X, Y
        INC C
        JMP .sub
.out:   CMP C, #'0'
        JNZ .show
        TST D
        JZ .skip
.show:  PUSHW X
        PUSHW Y
        PUSH D
        MOV A, C
        CALL putc
        POP D
        POPW Y
        POPW X
        MOV D, #1
.skip:  RET

; X = string → Y = its length. Keeps X.
strlen:
        PUSHW X
        LDW Y, #0
.l:     LD A, [X]
        TST A
        JZ .d
        INCW X
        INCW Y
        JMP .l
.d:     POPW X
        RET

; Same strings at X and Y? → Z. Keeps X and Y.
streq:
        PUSHW X
        PUSHW Y
.l:     LD A, [X]
        LD B, [Y]
        CMP A, B
        JNZ .ne
        TST A
        JZ .eq
        INCW X
        INCW Y
        JMP .l
.eq:    POPW Y
        POPW X
        MOV A, #0
        TST A
        RET
.ne:    POPW Y
        POPW X
        MOV A, #1
        TST A
        RET

; Does the string at X start with the one at Y? → Z. Keeps X and Y.
startswith:
        PUSHW X
        PUSHW Y
.l:     LD B, [Y]
        TST B
        JZ .yes
        LD A, [X]
        CMP A, B
        JNZ .no
        INCW X
        INCW Y
        JMP .l
.yes:   POPW Y
        POPW X
        MOV A, #0
        TST A
        RET
.no:    POPW Y
        POPW X
        MOV A, #1
        TST A
        RET

; Copy the string at Y to X (NUL included). X ends on the NUL.
strcpy:
        LD A, [Y]
        ST [X], A
        TST A
        JZ .d
        INCW X
        INCW Y
        JMP strcpy
.d:     RET

; X past any spaces.
skipsp:
        LD A, [X]
        CMP A, #' '
        JNZ .d
        INCW X
        JMP skipsp
.d:     RET

; X past the current word (to a space or the end).
skipword:
        LD A, [X]
        TST A
        JZ .d
        CMP A, #' '
        JZ .d
        INCW X
        JMP skipword
.d:     RET

; Is the machine speaking Portuguese? → Z clear if so.
is_pt:
        IN A, #P_LANG
        TST A
        RET

; X = a MSG (two words: English, Portuguese) → the right one to stdout.
putmsg:
        CALL is_pt
        JZ .en
        ADDW X, #2
.en:    LDW X, [X]
        JMP puts

; X = a MSG → X = the right string.
msgstr:
        CALL is_pt
        JZ .en
        ADDW X, #2
.en:    LDW X, [X]
        RET

