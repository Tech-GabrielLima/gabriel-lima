; Small kernel helpers.

; X = address, Y = length: zeroes it.
k_zero:
        CMPW Y, #0
        JZ .d
        MOV A, #0
        ST [X], A
        INCW X
        DECW Y
        JMP k_zero
.d:     RET

; C:D bytes from Y to X; both end past what they copied.
k_copy:
        MOV A, C
        OR A, D
        JZ .d
.l:     LD A, [Y]
        ST [X], A
        INCW X
        INCW Y
        SUB C, #1
        SBC D, #0
        MOV A, C
        OR A, D
        JNZ .l
.d:     RET

; Are the strings at X and Y the same? → Z (and A = 0) if so. Keeps X and Y.
k_streq:
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

; The string at Y, NUL and all, to X.
k_strcpy:
        LD A, [Y]
        ST [X], A
        TST A
        JZ .d
        INCW X
        INCW Y
        JMP k_strcpy
.d:     RET
