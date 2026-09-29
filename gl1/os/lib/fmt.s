; Aligned numbers and strings, and parsing numbers.

; X = number, C = width: right-aligned in that many columns.
putdecw:
        PUSHW X
        MOV D, #1
        LDW Y, #10
.l:     CMP D, #5
        JNC .pad
        CMPW X, Y
        JC .pad
        INC D
        PUSHW X
        MOVW X, Y
        ADDW Y, Y
        ADDW Y, Y
        ADDW Y, X
        ADDW Y, Y
        POPW X
        JMP .l
.pad:   CMP D, C
        JNC .num
        PUSH C
        PUSH D
        MOV A, #' '
        CALL putc
        POP D
        POP C
        DEC C
        JMP .pad
.num:   POPW X
        JMP putdec

; X = string, C = width: left-aligned, padded with spaces.
putsw:
        PUSH C
        CALL strlen
        CALL puts
        POP C
        MOV A, YL
.p:     CMP A, C
        JNC .d
        PUSH A
        PUSH C
        MOV A, #' '
        CALL putc
        POP C
        POP A
        INC A
        JMP .p
.d:     RET

; The number at X (decimal) → Y, X past it; C set if there were no digits.
atoi:
        LDW Y, #0
        MOV D, #0
.l:     LD A, [X]
        CMP A, #'0'
        JC .d
        CMP A, #'9' + 1
        JNC .d
        SUB A, #'0'
        ; Y = Y * 10 + A
        PUSHW X
        MOVW X, Y
        ADDW Y, Y
        ADDW Y, Y
        ADDW Y, X
        ADDW Y, Y
        POPW X
        ADDW Y, A
        INCW X
        MOV D, #1
        JMP .l
.d:     TST D
        JZ .none
        AND A, #0       ; clears C
        RET
.none:  MOV A, #1
        SHR A           ; sets C
        RET

