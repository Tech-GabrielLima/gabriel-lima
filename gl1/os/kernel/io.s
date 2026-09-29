; Console, the host mailbox, and device files.

; Waits for a key → A.
k_getkey:
.w:     IN A, #P_CON_STATUS
        TST A
        JNZ .got
        CALL k_wait
        JMP .w
.got:   IN A, #P_CON_IN
        RET

; The mailbox is one conversation at a time.
k_host_lock:
.w:     LD A, [host_busy]
        TST A
        JZ .take
        CALL k_wait
        JMP .w
.take:  MOV A, #1
        ST [host_busy], A
        RET

; MSGBUF (NUL-terminated) goes out; the whole reply lands in DEVBUF.
; → X = its length. Releases the mailbox.
k_host_send:
        LDW Y, #MSGBUF
.s:     LD A, [Y]
        TST A
        JZ .sent
        OUT #P_HOST_DATA, A
        INCW Y
        JMP .s
.sent:  MOV A, #1
        OUT #P_HOST_CTRL, A
.w:     IN A, #P_HOST_STATUS
        AND A, #2
        JNZ .rd
        CALL k_wait
        JMP .w
.rd:    LDW X, #DEVBUF
        LDW Y, #0
.r:     IN A, #P_HOST_STATUS
        AND A, #1
        JZ .end
        IN A, #P_HOST_DATA
        CMPW Y, #DEVBUF_SIZE
        JNC .r
        ST [X], A
        INCW X
        INCW Y
        JMP .r
.end:   MOV A, #0
        ST [X], A
        ST [host_busy], A
        MOVW X, Y
        RET

; Opening a device to read it: "r <path>" → the reply in DEVBUF, X = its length.
k_dev_read:
        CALL k_host_lock
        MOV A, #'r'
        ST [MSGBUF], A
        MOV A, #' '
        ST [MSGBUF+1], A
        LDW X, [fi_inode]
        LDW Y, #MSGBUF+2
        CALL k_path
        JMP k_host_send

; Writing to a device ([io_f]): "w <path> <data>", 200 bytes a message.
; Whatever the host answers is for the person at the console.
k_dev_write:
        LDW X, [sx]
        STW [dw_p], X
        LDW X, [sy]
        STW [dw_n], X
.chunk: CALL k_host_lock
        MOV A, #'w'
        ST [MSGBUF], A
        MOV A, #' '
        ST [MSGBUF+1], A
        LDW Y, [io_f]
        LDW X, [Y+F_INODE]
        LDW Y, #MSGBUF+2
        CALL k_path
        LDW X, #MSGBUF
.e:     LD A, [X]
        TST A
        JZ .ee
        INCW X
        JMP .e
.ee:    MOV A, #' '
        ST [X], A
        INCW X
        LDW Y, [dw_p]
        MOV C, #200
.d:     LD A, [dw_n]
        LD B, [dw_n+1]
        OR A, B
        JZ .dd
        LD A, [Y]
        ST [X], A
        INCW X
        INCW Y
        LD A, [dw_n]
        SUB A, #1
        ST [dw_n], A
        LD A, [dw_n+1]
        SBC A, #0
        ST [dw_n+1], A
        DEC C
        JNZ .d
.dd:    MOV A, #0
        ST [X], A
        STW [dw_p], Y
        CALL k_host_send
        LDW Y, #DEVBUF
.pr:    CMPW X, #0
        JZ .more
        LD A, [Y]
        OUT #P_CON_OUT, A
        INCW Y
        DECW X
        JMP .pr
.more:  LD A, [dw_n]
        LD B, [dw_n+1]
        OR A, B
        JNZ .chunk
        RET

; X = message, Y = reply buffer, C = its size → X = the reply's full length.
sys_host:
        CALL k_host_lock
        LDW X, #MSGBUF
        LDW Y, [sx]
        MOV C, #250
.c:     LD A, [Y]
        ST [X], A
        TST A
        JZ .s
        INCW X
        INCW Y
        DEC C
        JNZ .c
        MOV A, #0
        ST [X], A
.s:     CALL k_host_send
        STW [t_left], X
        ; copy what fits (size - 1, for the NUL); the size is C (low) and D (high)
        LD A, [sc]
        MOV YL, A
        LD A, [sd]
        MOV YH, A
        CMPW Y, #0
        JZ .none
        DECW Y
        CMPW X, Y
        JBE .n
        MOVW X, Y
.n:     MOV C, XL
        MOV D, XH
        LDW Y, #DEVBUF
        LDW X, [sy]
        CALL k_copy
        MOV A, #0
        ST [X], A
.none:  LDW X, [t_left]
        MOV A, #0
        RET

; ---------------------------------------------------------------- kernel prints

; The NUL-terminated string at X, straight to the console.
k_puts:
        LD A, [X]
        TST A
        JZ .d
        OUT #P_CON_OUT, A
        INCW X
        JMP k_puts
.d:     RET

; X as $XXXX.
k_puthex:
        MOV A, #'$'
        OUT #P_CON_OUT, A
        MOV A, XH
        CALL .byte
        MOV A, XL
.byte:  PUSH A
        SHR A
        SHR A
        SHR A
        SHR A
        CALL .nib
        POP A
.nib:   AND A, #15
        CMP A, #10
        JC .dig
        ADD A, #'A' - 10
        OUT #P_CON_OUT, A
        RET
.dig:   ADD A, #'0'
        OUT #P_CON_OUT, A
        RET
