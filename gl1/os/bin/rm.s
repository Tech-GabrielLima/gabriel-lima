; rm [-r] [-f] path...   (with -r, directories and everything in them)

.include "inc/gl1.inc"
        .relocatable
STACK = 700

start:
        STW [argp], X
.opt:   LDW X, [argp]
        CALL skipsp
        LD A, [X]
        CMP A, #'-'
        JNZ .args
.fl:    INCW X
        LD A, [X]
        CMP A, #'r'
        JZ .r
        CMP A, #'R'
        JZ .r
        CMP A, #'f'
        JZ .f
        STW [argp], X
        JMP .opt
.r:     MOV B, #1
        ST [recur], B
        JMP .fl
.f:     MOV B, #1
        ST [force], B
        JMP .fl
.args:  LD A, [X]
        TST A
        JNZ .one
        LD A, [did]
        TST A
        JNZ .end
        LDW X, #m_usage
        CALL putmsg
        MOV B, #2
        SYS SYS_EXIT
.one:   ; copy the word into pbuf
        LDW Y, #pbuf
.cp:    LD A, [X]
        TST A
        JZ .cpd
        CMP A, #' '
        JZ .cpd
        ST [Y], A
        INCW X
        INCW Y
        JMP .cp
.cpd:   STW [argp], X
        MOV A, #0
        ST [Y], A
        MOV A, #1
        ST [did], A
        ; the root of everything
        LD A, [pbuf]
        CMP A, #'/'
        JNZ .go
        LD A, [pbuf+1]
        TST A
        JNZ .go
        CALL getuid
        TST A
        JZ .rootall
        LDW X, #m_nice
        CALL putmsg
        MOV A, #1
        ST [status], A
        JMP .opt
.rootall:
        LD A, [recur]
        TST A
        JZ .go
        CALL remove
        ; the machine noticed
        LDW X, #f_rmrf
        CALL host
        JMP .opt
.go:    CALL remove
        JMP .opt
.end:   LD B, [status]
        SYS SYS_EXIT

; Removes pbuf (and, with -r, what's inside it). → A = 0 if it's gone.
remove:
        LDW X, #pbuf
        LDW Y, #st
        SYS SYS_STAT
        TST A
        JZ .there
        LD B, [force]
        TST B
        JNZ .ok
        JMP say
.there: LD A, [st + ST_KIND]
        CMP A, #K_DIR
        JNZ .unlink
        LD A, [recur]
        TST A
        JZ .isdir
        ; empty it, one entry at a time (no descriptor is kept across the recursion)
.child: LDW X, #pbuf
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ say
        MOV B, XL
        PUSH B
        LDW Y, #st
        SYS SYS_READDIR
        POP B
        PUSH A
        SYS SYS_CLOSE
        POP A
        TST A
        JNZ .empty
        ; pbuf += "/" + name, then down
        LDW X, #pbuf
        CALL strlen
        PUSHW Y
        ADDW X, Y
        DECW X
        LD A, [X]
        INCW X
        CMP A, #'/'
        JZ .nosl
        MOV A, #'/'
        ST [X], A
        INCW X
.nosl:  LDW Y, #st
        CALL strcpy
        CALL remove
        POPW Y
        LDW X, #pbuf
        ADDW X, Y
        MOV B, #0
        ST [X], B
        TST A
        JZ .child
        RET
.empty: ; / itself can't go
        LD A, [pbuf]
        CMP A, #'/'
        JNZ .unlink
        LD A, [pbuf+1]
        TST A
        JZ .ok
.unlink:
        LDW X, #pbuf
        SYS SYS_UNLINK
        TST A
        JNZ say
.ok:    MOV A, #0
        RET
.isdir: MOV A, #E_ISDIR

; "rm: path: reason", A = the error → A stays nonzero.
say:    PUSH A
        LDW X, #s_rm
        CALL puts
        LDW X, #pbuf
        CALL puts
        POP A
        PUSH A
        LDW X, #m_noent
        CMP A, #E_NOENT
        JZ .m
        LDW X, #m_perm
        CMP A, #E_PERM
        JZ .m
        LDW X, #m_isdir
        CMP A, #E_ISDIR
        JZ .m
        LDW X, #m_notempty
.m:     CALL putmsg
        MOV A, #1
        ST [status], A
        POP A
        RET

s_rm:   .db "rm: ", 0
f_rmrf: .db "frame rmrf", 0
argp:   .dw 0
recur:  .db 0
force:  .db 0
did:    .db 0
status: .db 0
st:     .ds 32
pbuf:   .ds 128

.include "lib/libgl.s"
.include "lib/user.s"
.include "lib/host.s"
        MSG m_usage, "usage: rm [-rf] PATH...\n", "uso: rm [-rf] CAMINHO...\n"
        MSG m_noent, ": no such file or directory\n", ": arquivo ou diretório inexistente\n"
        MSG m_perm, ": permission denied\n", ": permissão negada\n"
        MSG m_isdir, ": is a directory (use -r)\n", ": é um diretório (use -r)\n"
        MSG m_notempty, ": directory not empty\n", ": diretório não vazio\n"
        MSG m_nice, "rm: nice try. / belongs to root, and root lives in the machine room.\n", "rm: boa tentativa. O / é do root, e o root mora na sala de máquinas.\n"
