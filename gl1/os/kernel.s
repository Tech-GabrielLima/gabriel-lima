; GL-OS kernel. Loaded by the ROM at $0400.
;
; A small Unix for an 8-bit machine: up to 8 processes in 11 slots of 4 KB,
; preemptive round-robin on a 100 Hz timer, syscalls through INT 0, GLFS on
; the disk, device files answered by the host, and a mailbox to the world
; outside the machine (the cinema).
;
; Conventions
;   Syscalls: A = number, arguments in B C D X Y; results in A (0 = fine,
;   else an E_ code) and X. B C D Y are preserved for the caller.
;   Inside the kernel, routines take and return what their comment says and
;   may clobber every other register.
;   The kernel runs with interrupts off, except while a syscall waits (k_wait),
;   where the timer may hand the CPU to another process.

.include "inc/gl1.inc"
.include "kernel/defs.inc"

        .org KERNEL

kmain:
        DI
        LDW SP, #$2FF0
        ; Take over the vectors the kernel handles.
        LDW X, #TRAMPOLINES + 6
        LDW Y, #k_illegal
        CALL k_trampoline
        LDW X, #TRAMPOLINES + 9
        LDW Y, #k_brk
        CALL k_trampoline
        LDW X, #TRAMPOLINES + 12
        LDW Y, #k_swi
        CALL k_trampoline
        LDW X, #TRAMPOLINES + 15
        LDW Y, #k_timer
        CALL k_trampoline

        IN A, #P_LANG
        ST [lang], A
        MOV A, #$FF
        ST [sec_cache], A
        ST [sec_cache+1], A
        CALL k_read_bootblock

        ; Empty tables; file 0 is the console, open forever.
        LDW X, #PROCS
        LDW Y, #(PROC_SIZE * (NPROC + 1))
        CALL k_zero
        LDW X, #FILES
        LDW Y, #(FILE_SIZE * NFILES)
        CALL k_zero
        LDW X, #slots
        LDW Y, #SLOT_COUNT
        CALL k_zero
        MOV A, #$FF
        ST [FILES + F_REF], A
        MOV A, #FK_CON
        ST [FILES + F_KIND], A

        ; The kernel's own "process", current until init runs: root, at /, on the console.
        LDW X, #KPROC
        STW [curp], X
        MOV A, #NPROC - 1
        ST [cur], A
        MOV A, #$FF
        ST [KPROC + P_FD + 3], A
        MOV A, #2
        ST [next_pid], A

        LDW X, #s_kernel
        CALL k_puts

        ; init, pid 1.
        MOV A, #1
        ST [next_pid], A
        LDW X, #s_init_path
        STW [sx], X
        LDW X, #s_empty
        STW [sy], X
        MOV A, #$FF
        ST [sc], A
        CALL k_spawn
        TST A
        JZ .timer
        LDW X, #s_noinit
        CALL k_puts
        MOV A, #3
        OUT #P_POWER, A
        HLT

.timer: MOV A, #10
        OUT #P_TIMER, A
        MOV A, #IRQ_TIMER
        OUT #P_IRQ_MASK, A
        JMP k_pick

; X = trampoline, Y = handler: writes "JMP handler" there.
k_trampoline:
        MOV A, #$50
        ST [X], A
        STW [X+1], Y
        RET

; ================================================================ scheduling

; Timer: count the tick, then maybe give the CPU to someone else.
k_timer:
        PUSH A
        PUSH B
        PUSH C
        PUSH D
        PUSHW X
        PUSHW Y
        MOV A, #IRQ_TIMER
        OUT #P_IRQ_ACK, A
        LDW X, [ticks]
        INCW X
        STW [ticks], X
        LD A, [idle]
        TST A
        JNZ k_resume
        JMP k_switch

; The frame on the stack (F PC, A B C D X Y) goes back into the CPU.
k_resume:
        POPW Y
        POPW X
        POP D
        POP C
        POP B
        POP A
        RETI

; The current process's frame is on its stack: remember where, choose the next.
k_switch:
        LDW X, [curp]
        STW [X+P_SP], SP
; Choose the next ready process after the current one (round robin).
k_pick:
        CALL k_wake_sleepers
        LD A, [cur]
        MOV B, #NPROC
.next:  INC A
        AND A, #NPROC - 1
        CALL k_proc_ptr
        LD C, [X+P_STATE]
        CMP C, #ST_READY
        JZ .found
        DEC B
        JNZ .next
        ; Nobody can run: idle until the next tick.
        MOV A, #1
        ST [idle], A
        EI
        HLT
        DI
        MOV A, #0
        ST [idle], A
        JMP k_pick
.found: ST [cur], A
        STW [curp], X
        LDW SP, [X+P_SP]
        JMP k_resume

; A = process index → X = its entry (keeps A).
k_proc_ptr:
        PUSH A
        LDW X, #PROCS
        SHL A
        SHL A
        SHL A
        SHL A
        SHL A
        ADDW X, A
        POP A
        RET

; Sleepers whose time has come are ready again.
k_wake_sleepers:
        LDW X, #PROCS
        MOV C, #NPROC
.l:     LD A, [X+P_STATE]
        CMP A, #ST_SLEEP
        JNZ .n
        LDW Y, [X+P_WAKE]
        PUSHW X
        LDW X, [ticks]
        SUBW X, Y
        POPW X
        JN .n
        MOV A, #ST_READY
        ST [X+P_STATE], A
.n:     ADDW X, #PROC_SIZE
        DEC C
        JNZ .l
        RET

; Inside a syscall: sleep until the next interrupt, letting others run.
; Keeps the syscall's arguments (another process may make syscalls meanwhile).
; Clobbers A, X and Y.
k_wait:
        CALL k_save_args
        EI
        HLT
        DI
        CALL k_restore_args
        RET

; Inside a syscall, after setting the current process's state: give the CPU
; away until something makes it READY again. Clobbers A, X and Y.
k_block:
        CALL k_save_args
        CALL .frame
        CALL k_restore_args
        RET
.frame: PUSHF
        PUSH A
        PUSH B
        PUSH C
        PUSH D
        PUSHW X
        PUSHW Y
        JMP k_switch

; The argument variables, onto the caller's stack and back.
k_save_args:
        POPW Y                  ; return address
        LD A, [sa]
        PUSH A
        LD A, [sb]
        PUSH A
        LD A, [sc]
        PUSH A
        LD A, [sd]
        PUSH A
        LDW X, [sx]
        PUSHW X
        LDW X, [sy]
        PUSHW X
        JMPW Y
k_restore_args:
        POPW Y                  ; return address
        POPW X
        STW [sy], X
        POPW X
        STW [sx], X
        POP A
        ST [sd], A
        POP A
        ST [sc], A
        POP A
        ST [sb], A
        POP A
        ST [sa], A
        JMPW Y

; ================================================================ traps

k_illegal:
        LDW X, #s_illegal
        MOV B, #132
        JMP k_fault
k_brk:
        LDW X, #s_brk
        MOV B, #133
; A program did something it can't: say so, and end it.
k_fault:
        PUSH B
        CALL k_puts
        ; the faulting PC is on the stack: F, PC lo, PC hi (above the pushed B)
        LD A, [SP+2]
        MOV XL, A
        LD A, [SP+3]
        MOV XH, A
        CALL k_puthex
        LDW X, #s_in
        CALL k_puts
        LDW X, [curp]
        ADDW X, #P_NAME
        CALL k_puts
        LDW X, #s_crlf
        CALL k_puts
        POP B
        LDW X, [curp]
        LD A, [X+P_PID]
        CMP A, #1
        JZ k_panic_init
        CALL k_exit_proc
        JMP k_pick

k_panic_init:
        LDW X, #s_initdied
        CALL k_puts
        MOV A, #3
        OUT #P_POWER, A
        HLT

; ================================================================ syscalls

k_swi:
        PUSH B
        PUSH C
        PUSH D
        PUSHW Y
        ST [sa], A
        ST [sb], B
        ST [sc], C
        ST [sd], D
        STW [sx], X
        STW [sy], Y
        CMP A, #NSYS
        JNC .bad
        LDW X, #systab
        SHL A
        ADDW X, A
        LDW X, [X]
        CALLW X
.ret:   POPW Y
        POP D
        POP C
        POP B
        RETI
.bad:   MOV A, #E_NOENT
        LDW X, #$FFFF
        JMP .ret

systab:
        .dw sys_exit, sys_putc, sys_getc, sys_write, sys_read, sys_open, sys_close, sys_readdir
        .dw sys_stat, sys_exec, sys_spawn, sys_kill, sys_proc, sys_getuid, sys_chdir, sys_getcwd
        .dw sys_unlink, sys_uptime, sys_host, sys_mkdir, sys_sleep, sys_args, sys_getpid, sys_power
        .dw sys_dup2, sys_yield, sys_time, sys_isatty
NSYS = ($ - systab) / 2

.include "kernel/proc.s"
.include "kernel/fs.s"
.include "kernel/io.s"
.include "kernel/lib.s"
.include "kernel/data.s"
