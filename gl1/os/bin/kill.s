; kill [-9] PID

.include "inc/gl1.inc"
        .relocatable

start:
        CALL skipsp
        LD A, [X]
        CMP A, #'-'
        JNZ .num
        CALL skipword
        CALL skipsp
.num:   CALL atoi
        JC usage
        MOV A, YL
        ST [pid], A
        CMP A, #1
        JZ .init
        CALL proc_by_pid
        JNZ .none
        ; who was it?
        LDW X, #pinfo + PI_NAME
        LDW Y, #usher
        CALL streq
        JNZ .kill
        MOV A, #1
        ST [was_usher], A
.kill:  LD B, [pid]
        SYS SYS_KILL
        TST A
        JNZ .perm
        LD A, [was_usher]
        TST A
        JZ .ok
        LDW X, #f_kill
        CALL host
        LDW X, #m_usher
        CALL putmsg
.ok:    MOV B, #0
        SYS SYS_EXIT
.init:  LDW X, #m_init
        JMP fail
.none:  LDW X, #m_none
        JMP fail
.perm:  LDW X, #m_perm
fail:   PUSHW X
        LDW X, #s_kill
        CALL puts
        POPW X
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
usage:  LDW X, #m_usage
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT

s_kill: .db "kill: ", 0
usher:  .db "lanterninha", 0
f_kill: .db "frame kill", 0
pid:    .db 0
was_usher: .db 0

.include "lib/libgl.s"
.include "lib/fmt.s"
.include "lib/host.s"
.include "lib/procs.s"
        MSG m_usage, "usage: kill PID (see ps)\n", "uso: kill PID (veja o ps)\n"
        MSG m_none, "no such process\n", "processo inexistente\n"
        MSG m_perm, "operation not permitted\n", "operação não permitida\n"
        MSG m_init, "(1) init doesn't die. It's the one who brings the others back.\n", "(1) o init não morre. É ele quem traz os outros de volta.\n"
        MSG m_usher, "The usher's light went out. The house is quiet.\n", "A lanterna do lanterninha apagou. A sala ficou em silêncio.\n"
