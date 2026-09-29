; ls [-a] [-l] [path]   what's in a directory (colours: dirs, programs, devices)

.include "inc/gl1.inc"
        .relocatable

start:
        STW [argp], X
.opt:   LDW X, [argp]
        CALL skipsp
        LD A, [X]
        CMP A, #'-'
        JNZ .path
.fl:    INCW X
        LD A, [X]
        CMP A, #'a'
        JNZ .nl
        MOV B, #1
        ST [all], B
        JMP .fl
.nl:    CMP A, #'l'
        JNZ .fe
        MOV B, #1
        ST [long], B
        JMP .fl
.fe:    STW [argp], X
        JMP .opt
.path:  LD A, [X]
        TST A
        JNZ .has
        LDW X, #dot
.has:   STW [path], X
        LDW Y, #ent
        SYS SYS_STAT
        TST A
        JNZ fail
        LD A, [ent + ST_KIND]
        CMP A, #K_DIR
        JZ .dir
        CALL show
        JMP done
.dir:   LDW X, [path]
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ fail
        MOV A, XL
        ST [fd], A
.next:  LD B, [fd]
        LDW Y, #ent
        SYS SYS_READDIR
        TST A
        JNZ done
        LD A, [ent + ST_MODE]
        AND A, #M_HIDDEN
        JZ .vis
        LD A, [all]
        TST A
        JZ .next
.vis:   CALL show
        JMP .next
done:   LD A, [long]
        TST A
        JNZ .x
        LD A, [col]
        TST A
        JZ .x
        CALL newline
.x:     MOV B, #0
        SYS SYS_EXIT

fail:   PUSH A
        LDW X, #s_ls
        CALL puts
        LDW X, [path]
        CALL puts
        POP A
        LDW X, #m_noent
        CMP A, #E_NOENT
        JZ .m
        LDW X, #m_perm
.m:     CALL putmsg
        MOV B, #1
        SYS SYS_EXIT

; One entry (in ent).
show:
        LD A, [long]
        TST A
        JZ .short
        ; kind and mode, owner, size
        LD A, [ent + ST_KIND]
        MOV B, #'-'
        CMP A, #K_DIR
        JNZ .k1
        MOV B, #'d'
.k1:    CMP A, #K_DEV
        JNZ .k2
        MOV B, #'c'
.k2:    MOV A, B
        CALL putc
        LD A, [ent + ST_MODE]
        MOV B, #'-'
        AND A, #M_READ
        JZ .r
        MOV B, #'r'
.r:     MOV A, B
        CALL putc
        LD A, [ent + ST_MODE]
        MOV B, #'-'
        AND A, #M_WRITE
        JZ .w
        MOV B, #'w'
.w:     MOV A, B
        CALL putc
        LD A, [ent + ST_MODE]
        MOV B, #'-'
        AND A, #M_EXEC
        JZ .e
        MOV B, #'x'
.e:     MOV A, B
        CALL putc
        MOV A, #' '
        CALL putc
        LD A, [ent + ST_OWNER]
        CMP A, #3
        JC .o
        MOV A, #1
.o:     SHL A
        LDW X, #owners
        ADDW X, A
        LDW X, [X]
        CALL puts
        LDW X, [ent + ST_SIZE]
        CALL pad
        CALL putdec
        MOV A, #' '
        CALL putc
        CALL name
        JMP newline
.short: ; wrap before the edge of the screen
        LDW X, #ent
        CALL strlen
        MOV A, YL
        ADD A, #3
        LD B, [col]
        ADD B, A
        IN A, #P_CON_COLS
        CMP B, A
        JC .fits
        CALL newline
        MOV A, #0
        ST [col], A
        LDW X, #ent
        CALL strlen
        MOV A, YL
        ADD A, #3
        MOV B, A
.fits:  ST [col], B
        CALL name
        LDW X, #s_gap
        JMP puts

; Right-align the size in 7 columns (X = size, kept).
pad:    PUSHW X
        MOV C, #6
        LDW Y, #10
.l:     CMPW X, Y
        JC .sp
        PUSHW X
        MOVW X, Y
        ADDW Y, Y
        ADDW Y, Y
        ADDW Y, X
        ADDW Y, Y
        POPW X
        DEC C
        JNZ .l
        JMP .d
.sp:    PUSH C
        MOV A, #' '
        CALL putc
        POP C
        DEC C
        JNZ .sp
.d:     POPW X
        RET

; The name, coloured by kind.
name:
        LDW X, #c_off
        LD A, [ent + ST_KIND]
        CMP A, #K_DIR
        JNZ .n1
        LDW X, #c_dir
.n1:    CMP A, #K_DEV
        JNZ .n2
        LDW X, #c_dev
.n2:    LD A, [ent + ST_MODE]
        AND A, #M_EXEC
        JZ .n3
        LDW X, #c_exe
.n3:    CALL puts
        LDW X, #ent
        CALL puts
        LD A, [ent + ST_KIND]
        CMP A, #K_DIR
        JNZ .n4
        MOV A, #'/'
        CALL putc
.n4:    LDW X, #c_off
        JMP puts

owners: .dw o_root, o_vis, o_caixa
o_root: .db "root      ", 0
o_vis:  .db "visitante ", 0
o_caixa: .db "caixa     ", 0
dot:    .db ".", 0
s_ls:   .db "ls: ", 0
s_gap:  .db "  ", 0
c_dir:  .db "\e[36m", 0
c_exe:  .db "\e[32m", 0
c_dev:  .db "\e[33m", 0
c_off:  .db "\e[0m", 0
argp:   .dw 0
path:   .dw 0
fd:     .db 0
all:    .db 0
long:   .db 0
col:    .db 0
ent:    .ds 32

.include "lib/libgl.s"
        MSG m_noent, ": no such file or directory\n", ": arquivo ou diretório inexistente\n"
        MSG m_perm, ": permission denied\n", ": permissão negada\n"
