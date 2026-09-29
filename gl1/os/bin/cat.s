; cat [file...]   files (or stdin) to stdout

.include "inc/gl1.inc"
        .relocatable

start:
        STW [argp], X
        CALL skipsp
        LD A, [X]
        TST A
        JNZ .files
        MOV A, #0
        ST [fd], A
        CALL pump
        JMP .end
.files: LDW X, [argp]
        CALL skipsp
        LD A, [X]
        TST A
        JZ .end
        STW [name], X
        CALL skipword
        LD A, [X]
        STW [argp], X
        ST [sep], A
        MOV A, #0
        ST [X], A
        LDW X, [name]
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ .fail
        MOV A, XL
        ST [fd], A
        CALL pump
        LD B, [fd]
        SYS SYS_CLOSE
.nextf: LDW X, [argp]
        LD A, [sep]
        ST [X], A
        JMP .files
.fail:  PUSH A
        LDW X, #s_cat
        CALL puts
        LDW X, [name]
        CALL puts
        POP A
        LDW X, #m_noent
        CMP A, #E_NOENT
        JZ .m
        LDW X, #m_perm
        CMP A, #E_PERM
        JZ .m
        LDW X, #m_isdir
.m:     CALL putmsg
        MOV A, #1
        ST [status], A
        JMP .nextf
.end:   LD B, [status]
        SYS SYS_EXIT

pump:
.rd:    LD B, [fd]
        LDW X, #buf
        LDW Y, #256
        SYS SYS_READ
        CMPW X, #0
        JZ .d
        MOVW Y, X
        LDW X, #buf
        MOV B, #1
        SYS SYS_WRITE
        JMP .rd
.d:     RET

s_cat:  .db "cat: ", 0
argp:   .dw 0
name:   .dw 0
fd:     .db 0
sep:    .db 0
status: .db 0
buf:    .ds 256

.include "lib/libgl.s"
        MSG m_noent, ": no such file or directory\n", ": arquivo ou diretório inexistente\n"
        MSG m_perm, ": permission denied\n", ": permissão negada\n"
        MSG m_isdir, ": is a directory\n", ": é um diretório\n"
