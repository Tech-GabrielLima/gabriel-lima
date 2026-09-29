; Processes: spawning (loading a GLX into a slot), exiting, waiting, killing.

; k_spawn: [sx] = path, [sy] = argument line, [sc] = uid for the child when the
; caller is root ($FF = the caller's). → A = status, X = pid.
k_spawn:
        ; A free process entry...
        MOV A, #0
.fp:    CALL k_proc_ptr
        LD B, [X+P_STATE]
        TST B
        JZ .gotp
        INC A
        CMP A, #NPROC
        JNZ .fp
        MOV A, #E_NOMEM
        RET
.gotp:  ST [sp_idx], A
        STW [sp_ptr], X
        ; ...and a free slot.
        MOV A, #0
        LDW X, #slots
.fs:    LD B, [X]
        TST B
        JZ .gots
        INCW X
        INC A
        CMP A, #SLOT_COUNT
        JNZ .fs
        MOV A, #E_NOMEM
        RET
.gots:  ST [sp_slot], A
        CALL k_slot_base
        STW [sp_base], X

        ; The program.
        LDW X, [sx]
        CALL k_lookup
        TST A
        JNZ .ret
        STW [fi_inode], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        CMP A, #K_FILE
        JNZ .noexec
        LD A, [Y+I_MODE]
        AND A, #M_EXEC
        JZ .noexec
        MOV A, #M_READ
        CALL k_may
        TST A
        JNZ .ret
        LDW X, #ld_f
        CALL k_file_from_inode
        LDW X, #ld_f
        STW [io_f], X

        ; The header.
        LDW X, #ld_hdr
        STW [io_buf], X
        LDW X, #16
        STW [io_len], X
        CALL k_file_read
        LDW X, [io_done]
        CMPW X, #16
        JNZ .noexec
        LD A, [ld_hdr]
        CMP A, #'G'
        JNZ .noexec
        LD A, [ld_hdr+1]
        CMP A, #'L'
        JNZ .noexec
        LD A, [ld_hdr+2]
        CMP A, #'X'
        JNZ .noexec

        ; Does it fit: code + bss + stack, below the argument line?
        LDW X, [ld_hdr+12]
        CMPW X, #0
        JNZ .hasstack
        LDW X, #DEFAULT_STACK
.hasstack:
        ADDXM ld_hdr+4
        JC .nomem
        ADDXM ld_hdr+6
        JC .nomem
        CMPW X, #ARGS_AT - 11
        JA .nomem

        ; Code into the slot, bss zeroed.
        LDW X, [sp_base]
        STW [io_buf], X
        LDW X, [ld_hdr+4]
        STW [io_len], X
        CALL k_file_read
        LDW X, [sp_base]
        ADDXM ld_hdr+4
        LDW Y, [ld_hdr+6]
        CALL k_zero

        ; Relocations: every listed word gets the load address added.
        LDW X, [ld_hdr+10]
        STW [sp_n], X
.rel:   LDW X, [sp_n]
        CMPW X, #0
        JZ .reldone
        DECW X
        STW [sp_n], X
        LDW X, #ld_word
        STW [io_buf], X
        LDW X, #2
        STW [io_len], X
        CALL k_file_read
        LDW X, [sp_base]
        ADDXM ld_word
        STW [sp_at], X
        LDW X, [X]
        ADDXM sp_base
        MOVW Y, X
        LDW X, [sp_at]
        STW [X], Y
        JMP .rel
.reldone:

        ; The argument line, at the top of the slot.
        LDW X, [sp_base]
        ADDW X, #ARGS_AT
        LDW Y, [sy]
        MOV C, #127
.ca:    LD A, [Y]
        ST [X], A
        TST A
        JZ .cadone
        INCW X
        INCW Y
        DEC C
        JNZ .ca
        MOV A, #0
        ST [X], A
.cadone:

        ; The first frame the scheduler will resume: Y X D C B A F PC.
        ; X = the argument line, F = interrupts on, PC = the entry point.
        LDW X, [sp_base]
        ADDW X, #ARGS_AT - 11
        STW [sp_frame], X
        LDW Y, #11
        CALL k_zero
        LDW X, [sp_frame]
        LDW Y, [sp_base]
        ADDW Y, #ARGS_AT
        STW [X+2], Y
        MOV A, #$10
        ST [X+8], A
        LDW X, [sp_base]
        ADDXM ld_hdr+8
        MOVW Y, X
        LDW X, [sp_frame]
        STW [X+9], Y

        ; The entry: inherits uid, directory and descriptors from the caller.
        LDW X, [sp_ptr]
        LDW Y, #PROC_SIZE
        CALL k_zero
        LDW Y, [sp_ptr]
        LDW X, [sp_frame]
        STW [Y+P_SP], X
        LD A, [sp_slot]
        ST [Y+P_SLOT], A
        LD A, [next_pid]
        ST [Y+P_PID], A
        ST [sp_pid], A
        INC A
        JNZ .pidok
        MOV A, #2
.pidok: ST [next_pid], A
        LDW X, [curp]
        LD A, [X+P_PID]
        ST [Y+P_PPID], A
        LD A, [X+P_UID]
        ST [Y+P_UID], A
        TST A
        JNZ .uidok
        LD A, [sc]
        CMP A, #$FF
        JZ .uidok
        ST [Y+P_UID], A
.uidok: LD A, [X+P_CWD]
        ST [Y+P_CWD], A
        LD A, [X+P_CWD+1]
        ST [Y+P_CWD+1], A
        ; descriptors
        MOV C, #0
.fd:    LDW X, [curp]
        ADDW X, C
        LD A, [X+P_FD]
        LDW Y, [sp_ptr]
        ADDW Y, C
        ST [Y+P_FD], A
        CMP A, #$FF
        JZ .nfd
        CALL k_file_ref
.nfd:   INC C
        CMP C, #NFD
        JNZ .fd
        ; the name: the last part of the path
        LDW X, [sx]
        MOVW Y, X
.bn:    LD A, [X]
        TST A
        JZ .bnend
        CMP A, #' '
        JZ .bnend
        INCW X
        CMP A, #'/'
        JNZ .bn
        MOVW Y, X
        JMP .bn
.bnend: LDW X, [sp_ptr]
        ADDW X, #P_NAME
        MOV C, #11
.nm:    LD A, [Y]
        TST A
        JZ .nmend
        CMP A, #' '
        JZ .nmend
        ST [X], A
        INCW X
        INCW Y
        DEC C
        JNZ .nm
.nmend: MOV A, #0
        ST [X], A

        ; Taken.
        LD A, [sp_slot]
        LDW X, #slots
        ADDW X, A
        MOV A, #1
        ST [X], A
        LDW X, [sp_ptr]
        MOV A, #ST_READY
        ST [X+P_STATE], A
        LD A, [sp_pid]
        MOV XL, A
        MOV XH, #0
        MOV A, #0
.ret:   RET
.noexec:
        MOV A, #E_NOEXEC
        RET
.nomem: MOV A, #E_NOMEM
        RET

; A = slot → X = its base address.
k_slot_base:
        SHL A
        SHL A
        SHL A
        SHL A
        ADD A, #>SLOTS
        MOV XH, A
        MOV XL, #0
        RET

; X = process entry, B = exit code: its descriptors close, its slot frees,
; its parent (if waiting for it) wakes with the code.
k_exit_proc:
        STW [ex_p], X
        ST [ex_code], B
        LD A, [X+P_PID]
        ST [ex_pid], A
        LD A, [X+P_PPID]
        ST [ex_ppid], A
        MOV C, #0
.fd:    LDW X, [ex_p]
        ADDW X, C
        LD A, [X+P_FD]
        CMP A, #$FF
        JZ .nfd
        MOV B, #$FF
        ST [X+P_FD], B
        CALL k_file_unref
.nfd:   INC C
        CMP C, #NFD
        JNZ .fd
        LDW X, [ex_p]
        LD A, [X+P_SLOT]
        LDW Y, #slots
        ADDW Y, A
        MOV A, #0
        ST [Y], A
        MOV A, #ST_FREE
        ST [X+P_STATE], A
        LD A, [ex_ppid]
        CALL k_find_pid
        TST A
        JNZ .done
        LD A, [X+P_STATE]
        CMP A, #ST_WAIT
        JNZ .done
        LD A, [X+P_WAITPID]
        LD B, [ex_pid]
        CMP A, B
        JNZ .done
        LD A, [ex_code]
        ST [X+P_CODE], A
        MOV A, #ST_READY
        ST [X+P_STATE], A
.done:  RET

; A = pid → X = its entry, A = 0 (or A = 1: no such process).
k_find_pid:
        MOV B, A
        MOV A, #0
.l:     CALL k_proc_ptr
        LD C, [X+P_STATE]
        TST C
        JZ .n
        LD C, [X+P_PID]
        CMP C, B
        JZ .ok
.n:     INC A
        CMP A, #NPROC
        JNZ .l
        MOV A, #1
        RET
.ok:    MOV A, #0
        RET

; ---------------------------------------------------------------- syscalls

sys_exit:
        LDW X, [curp]
        LD A, [X+P_PID]
        CMP A, #1
        JZ k_panic_init
        LD B, [sb]
        CALL k_exit_proc
        JMP k_pick

sys_spawn:
        JMP k_spawn

sys_exec:
        CALL k_spawn
        TST A
        JNZ .ret
        MOV A, XL
        LDW X, [curp]
        ST [X+P_WAITPID], A
        MOV A, #ST_WAIT
        ST [X+P_STATE], A
        CALL k_block
        LDW Y, [curp]
        LD A, [Y+P_CODE]
        MOV XL, A
        MOV XH, #0
        MOV A, #0
.ret:   RET

sys_kill:
        LD A, [sb]
        CMP A, #1
        JZ .perm
        CALL k_find_pid
        TST A
        JNZ .noent
        LDW Y, [curp]
        LD A, [Y+P_UID]
        TST A
        JZ .may
        LD B, [X+P_UID]
        CMP A, B
        JNZ .perm
.may:   CMPW X, Y
        JZ .self
        MOV B, #137
        CALL k_exit_proc
        MOV A, #0
        RET
.self:  MOV B, #137
        CALL k_exit_proc
        JMP k_pick
.perm:  MOV A, #E_PERM
        RET
.noent: MOV A, #E_NOENT
        RET

sys_proc:
        LD A, [sb]
        CMP A, #NPROC
        JNC .end
        CALL k_proc_ptr
        MOVW Y, X
        LDW X, [sy]
        MOV C, #PROC_SIZE
        MOV D, #0
        CALL k_copy
        MOV A, #0
        RET
.end:   MOV A, #1
        RET

sys_getuid:
        LDW X, [curp]
        LD A, [X+P_UID]
        MOV XL, A
        MOV XH, #0
        MOV A, #0
        RET

sys_getpid:
        LDW X, [curp]
        LD A, [X+P_PID]
        MOV XL, A
        MOV XH, #0
        MOV A, #0
        RET

sys_sleep:
        LDW X, [sx]
        LDW Y, #0
.d:     CMPW X, #10
        JC .dd
        ADDW X, #$FFF6
        INCW Y
        JMP .d
.dd:    CMPW Y, #0
        JNZ .s
        INCW Y
.s:     LDW X, [ticks]
        ADDW X, Y
        LDW Y, [curp]
        STW [Y+P_WAKE], X
        MOV A, #ST_SLEEP
        ST [Y+P_STATE], A
        CALL k_block
        MOV A, #0
        RET

sys_yield:
        CALL k_block
        MOV A, #0
        RET

sys_args:
        LDW X, [curp]
        LD A, [X+P_SLOT]
        CALL k_slot_base
        ADDW X, #ARGS_AT
        MOV A, #0
        RET

sys_power:
        LD A, [sb]
        OUT #P_POWER, A
        MOV A, #0
        RET

sys_uptime:
        IN A, #P_UPSEC0
        MOV XL, A
        IN A, #P_UPSEC1
        MOV XH, A
        MOV A, #0
        RET

; X = a 4-byte buffer ← Unix time
sys_time:
        LDW X, [sx]
        IN A, #P_RTC0
        ST [X], A
        IN A, #P_RTC1
        ST [X+1], A
        IN A, #P_RTC2
        ST [X+2], A
        IN A, #P_RTC3
        ST [X+3], A
        MOV A, #0
        RET
