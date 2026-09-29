; A = pid → Z set if it's running, and pinfo holds its entry.
proc_by_pid:
        ST [pp_want], A
        MOV A, #0
        ST [pp_idx], A
.l:     LD B, [pp_idx]
        LDW Y, #pinfo
        SYS SYS_PROC
        TST A
        JNZ .no
        LD A, [pinfo + PI_STATE]
        TST A
        JZ .n
        LD A, [pinfo + PI_PID]
        LD B, [pp_want]
        CMP A, B
        JZ .yes
.n:     LD A, [pp_idx]
        INC A
        ST [pp_idx], A
        JMP .l
.yes:   MOV A, #0
        TST A
        RET
.no:    MOV A, #1
        TST A
        RET
pp_want: .db 0
pp_idx:  .db 0
pinfo:   .ds 32
