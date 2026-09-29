; sh, the GL-OS shell.
;
;   cmd args          run /bin/cmd (the PATH depends on who you are)
;   cmd > file        stdout to a file (>> appends), cmd < file for stdin
;   a | b | c         a pipeline (through /tmp, like DOS did)
;   cmd &             in the background
;   cd pwd echo clear help exit history    built in
;   ↑                 the last line again

.include "inc/gl1.inc"
        .relocatable
STACK = 272

LINE_MAX = 104

start:
        LDW Y, #s_login
        CALL streq
        JNZ .loop
        ; a login shell starts at home
        CALL uid
        LDW X, #t_home
        CALL pick
        SYS SYS_CHDIR
        CALL motd
.loop:  CALL prompt
        CALL readline
        CALL run_line
        JMP .loop

; ---------------------------------------------------------------- who am I

; → A = uid (0 root, 1 visitante, 2 caixa)
uid:
        SYS SYS_GETUID
        MOV A, XL
        CMP A, #3
        JC .ok
        MOV A, #1
.ok:    RET

; A = uid, X = table of 3 words → X = the entry.
pick:
        SHL A
        ADDW X, A
        LDW X, [X]
        RET

motd:
        ; /etc/motd.<user>.<lang>
        LDW X, #pathbuf
        LDW Y, #s_motd
        CALL strcpy
        PUSHW X
        CALL uid
        LDW X, #t_user
        CALL pick
        MOVW Y, X
        POPW X
        CALL strcpy
        MOV A, #'.'
        ST [X], A
        INCW X
        LDW Y, #s_en
        CALL is_pt
        JZ .l
        LDW Y, #s_pt
.l:     CALL strcpy
        LDW X, #pathbuf
        JMP catfile

; The file at X → stdout (quietly nothing if it isn't there).
catfile:
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ .ret
        MOV A, XL
        ST [cfd], A
.rd:    LD B, [cfd]
        LDW X, #iobuf
        LDW Y, #96
        SYS SYS_READ
        CMPW X, #0
        JZ .done
        MOVW Y, X
        LDW X, #iobuf
        MOV B, #1
        SYS SYS_WRITE
        JMP .rd
.done:  LD B, [cfd]
        SYS SYS_CLOSE
.ret:   RET

prompt:
        LDW X, #s_c_user
        CALL puts
        CALL uid
        LDW X, #t_user
        CALL pick
        CALL puts
        MOV A, #'@'
        CALL putc
        CALL uid
        LDW X, #t_host
        CALL pick
        CALL puts
        LDW X, #s_c_path
        CALL puts
        LDW X, #cwdbuf
        SYS SYS_GETCWD
        LDW X, #cwdbuf
        CALL puts
        LDW X, #s_c_off
        CALL puts
        CALL uid
        TST A
        JNZ .dollar
        MOV A, #'#'
        CALL putc
        JMP .sp
.dollar:
        MOV A, #'$'
        CALL putc
.sp:    MOV A, #' '
        JMP putc

; ---------------------------------------------------------------- the line

readline:
        MOV A, #0
        ST [llen], A
.key:   SYS SYS_GETC
        CMPW X, #1
        JZ .eof
        CMP A, #13
        JZ .enter
        CMP A, #10
        JZ .enter
        CMP A, #8
        JZ .back
        CMP A, #127
        JZ .back
        CMP A, #3
        JZ .cancel
        CMP A, #12
        JZ .clear
        CMP A, #27
        JZ .esc
        CMP A, #' '
        JC .key
        ; a character (bytes of UTF-8 included)
        LD B, [llen]
        CMP B, #LINE_MAX
        JNC .key
        LDW X, #line
        ADDW X, B
        ST [X], A
        INC B
        ST [llen], B
        CALL putc
        JMP .key
.back:  CALL erase1
        JMP .key
.cancel:
        LDW X, #s_ctrlc
        CALL puts
        MOV A, #0
        ST [llen], A
        ST [line], A
        RET
.clear: LDW X, #s_cls
        CALL puts
        CALL prompt
        CALL retype
        JMP .key
.esc:   SYS SYS_GETC
        CMP A, #'['
        JNZ .key
        SYS SYS_GETC
        CMP A, #'A'
        JNZ .key
        ; ↑ : the last line
.wipe:  LD A, [llen]
        TST A
        JZ .hist
        CALL erase1
        JMP .wipe
.hist:  LDW X, #line
        LDW Y, #history
        CALL strcpy
        LDW X, #line
        CALL strlen
        MOV A, YL
        ST [llen], A
        CALL retype
        JMP .key
.eof:   ; stdin ran out (a script): run what's there and stop
        LD A, [llen]
        TST A
        JNZ .enter
        MOV B, #0
        SYS SYS_EXIT
.enter: CALL newline
        LD B, [llen]
        LDW X, #line
        ADDW X, B
        MOV A, #0
        ST [X], A
        TST B
        JZ .done
        LDW X, #history
        LDW Y, #line
        CALL strcpy
.done:  RET

; Take back the last character on the line (a whole UTF-8 one).
erase1:
        LD B, [llen]
        TST B
        JZ .d
.more:  DEC B
        LDW X, #line
        ADDW X, B
        LD A, [X]
        AND A, #$C0
        CMP A, #$80
        JNZ .gone
        TST B
        JNZ .more
.gone:  ST [llen], B
        LDW X, #s_bs
        CALL puts
.d:     RET

; Prints the line as it is.
retype:
        LD B, [llen]
        LDW X, #line
        ADDW X, B
        MOV A, #0
        ST [X], A
        LDW X, #line
        JMP puts

; ---------------------------------------------------------------- running it

run_line:
        LDW X, #line
        CALL skipsp
        LD A, [X]
        TST A
        JZ .ret
        STW [cur], X
        ; & at the end: in the background
        MOV A, #0
        ST [bg], A
        CALL strlen
        ADDW X, Y
.trim:  CMPW Y, #0
        JZ .split
        DECW X
        DECW Y
        LD A, [X]
        CMP A, #' '
        JZ .trim
        CMP A, #'&'
        JNZ .split
        MOV A, #1
        ST [bg], A
        MOV A, #0
        ST [X], A
.split: ; up to 3 stages, split at | (not inside quotes)
        MOV B, #0
        ST [inq], B
        LDW X, [cur]
        STW [stage0], X
        MOV A, #1
        ST [nstage], A
.s:     LD A, [X]
        TST A
        JZ .run
        CALL quote
        JNZ .sn
        CMP A, #'|'
        JNZ .sn
        MOV A, #0
        ST [X], A
        INCW X
        LD A, [nstage]
        CMP A, #3
        JNC .run
        LDW Y, #stage0
        ADDW Y, A
        ADDW Y, A
        STW [Y], X
        INC A
        ST [nstage], A
        JMP .s
.sn:    INCW X
        JMP .s
.run:   MOV A, #0
        ST [si], A
.each:  LD A, [si]
        LDW Y, #stage0
        ADDW Y, A
        ADDW Y, A
        LDW X, [Y]
        STW [cur], X
        CALL redirs
        TST A
        JNZ .restore
        CALL run_stage
        CALL restore_fds
        LD A, [si]
        INC A
        ST [si], A
        LD B, [nstage]
        CMP A, B
        JC .each
.ret:   RET
.restore:
        JMP restore_fds

; stdin and stdout of stage [si]: files named on its line, or the pipes around it.
; → A = 0, or not (and the error is said).
redirs:
        ; strip "> f", ">> f", "< f" off the stage
        MOV A, #0
        ST [out_mode], A
        ST [in_name], A
        ST [in_name+1], A
        ST [inq], A
        LDW X, [cur]
.f:     LD A, [X]
        TST A
        JZ .pipes
        CALL quote
        JNZ .fq
        CMP A, #'>'
        JZ .gt
        CMP A, #'<'
        JZ .lt
.fq:    INCW X
        JMP .f
.gt:    MOV A, #0
        ST [X], A
        INCW X
        MOV B, #1
        LD A, [X]
        CMP A, #'>'
        JNZ .gt1
        INCW X
        MOV B, #2
.gt1:   ST [out_mode], B
        CALL skipsp
        STW [out_name], X
        CALL skipword
        LD A, [X]
        MOV B, #0
        ST [X], B
        TST A
        JZ .pipes
        INCW X
        JMP .f
.lt:    MOV A, #0
        ST [X], A
        INCW X
        CALL skipsp
        STW [in_name], X
        CALL skipword
        LD A, [X]
        MOV B, #0
        ST [X], B
        TST A
        JZ .pipes
        INCW X
        JMP .f
.pipes: ; the stage without its redirections: no trailing spaces
        LDW X, [cur]
        CALL strlen
        ADDW X, Y
.tr:    CMPW Y, #0
        JZ .trd
        DECW X
        DECW Y
        LD A, [X]
        CMP A, #' '
        JNZ .trd
        MOV A, #0
        ST [X], A
        JMP .tr
.trd:   ; not the first stage: read the previous one's pipe
        LD A, [si]
        TST A
        JZ .in
        DEC A
        LDW X, #t_pipe
        CALL pick
        STW [in_name], X
.in:    LDW X, [in_name]
        CMPW X, #0
        JZ .out
        MOV B, #0
        MOV C, #0
        CALL open_as
        TST A
        JNZ .ret
.out:   ; not the last stage: write this one's pipe
        LD A, [si]
        INC A
        LD B, [nstage]
        CMP A, B
        JNC .file
        DEC A
        LDW X, #t_pipe
        CALL pick
        MOV B, #1
        MOV C, #1
        JMP open_as
.file:  LD B, [out_mode]
        TST B
        JZ .ok
        LDW X, [out_name]
        MOV C, #1
        JMP open_as
.ok:    MOV A, #0
.ret:   RET

; X = path, B = open mode, C = the descriptor it should become → A = 0 or an error (said).
open_as:
        ST [want_fd], C
        STW [errname], X
        SYS SYS_OPEN
        TST A
        JNZ err
        MOV B, XL
        ST [tmp_fd], B
        LD C, [want_fd]
        SYS SYS_DUP2
        LD B, [tmp_fd]
        SYS SYS_CLOSE
        MOV A, #0
        RET

; A = the character at X: tracks quotes → Z clear (and A kept) while inside "..." or '...'.
quote:
        CMP A, #'"'
        JZ .t
        CMP A, #$27
        JZ .t
        LD B, [inq]
        TST B
        RET
.t:     LD B, [inq]
        TST B
        JZ .open
        CMP A, B
        JNZ .in
        MOV B, #0
        ST [inq], B
        MOV B, #1
        TST B
        RET
.open:  ST [inq], A
.in:    MOV B, #1
        TST B
        RET

; stdin and stdout back to the console (which fd 2 always is).
restore_fds:
        MOV B, #2
        MOV C, #1
        SYS SYS_DUP2
        MOV B, #2
        MOV C, #0
        SYS SYS_DUP2
        RET

; [cur] = "cmd args" → runs it.
run_stage:
        LDW X, [cur]
        CALL skipsp
        LD A, [X]
        TST A
        JZ .ret
        ; the command word → cmd
        LDW Y, #cmd
        MOV C, #31
.cw:    LD A, [X]
        TST A
        JZ .cwd
        CMP A, #' '
        JZ .cwd
        ST [Y], A
        INCW X
        INCW Y
        DEC C
        JNZ .cw
.cwd:   MOV A, #0
        ST [Y], A
        CALL skipsp
        STW [args], X
        ; built in?
        LDW X, #builtins
.bi:    LDW Y, [X]
        CMPW Y, #0
        JZ .ext
        PUSHW X
        LDW X, #cmd
        CALL streq
        POPW X
        JZ .isbi
        ADDW X, #4
        JMP .bi
.isbi:  LDW X, [X+2]
        JMPW X
.ext:   LDW X, #cmd
        STW [errname], X
        CALL resolve
        TST A
        JNZ .nf
        LDW X, #pathbuf
        LDW Y, [args]
        MOV C, #$FF
        LD A, [bg]
        TST A
        JNZ .bg
        SYS SYS_EXEC
        TST A
        JNZ err
.ret:   RET
.bg:    SYS SYS_SPAWN
        TST A
        JNZ err
        PUSHW X
        MOV A, #'['
        CALL putc
        POPW X
        CALL putdec
        MOV A, #']'
        CALL putc
        JMP newline
.nf:    LDW X, #s_sh
        CALL puts
        LDW X, #cmd
        CALL puts
        LDW X, #s_colon
        CALL puts
        LDW X, #m_notfound
        JMP putmsg

; cmd → pathbuf: as written if it has a /, else the first match in the PATH.
; → A = 0 if found.
resolve:
        LDW X, #cmd
.sl:    LD A, [X]
        TST A
        JZ .path
        CMP A, #'/'
        JZ .asis
        INCW X
        JMP .sl
.asis:  LDW X, #pathbuf
        LDW Y, #cmd
        CALL strcpy
        JMP .stat
.path:  CALL uid
        LDW X, #t_path
        CALL pick
        STW [pp], X
.try:   LDW X, [pp]
        LDW Y, [X]
        CMPW Y, #0
        JZ .no
        LDW X, #pathbuf
        CALL strcpy
        MOV A, #'/'
        ST [X], A
        INCW X
        LDW Y, #cmd
        CALL strcpy
        LDW X, #pathbuf
        LDW Y, #statbuf
        SYS SYS_STAT
        TST A
        JZ .yes
        LDW X, [pp]
        ADDW X, #2
        STW [pp], X
        JMP .try
.stat:  LDW X, #pathbuf
        LDW Y, #statbuf
        SYS SYS_STAT
        RET
.yes:   MOV A, #0
        RET
.no:    MOV A, #1
        RET

; A = error code, [errname] = what it was about: "sh: name: reason".
err:
        PUSH A
        LDW X, #s_sh
        CALL puts
        LDW X, [errname]
        CALL puts
        LDW X, #s_colon
        CALL puts
        POP A
        CMP A, #13
        JC .k
        MOV A, #0
.k:     LDW X, #t_err
        SHL A
        ADDW X, A
        LDW X, [X]
        CALL putmsg
        MOV A, #1
        RET

; ---------------------------------------------------------------- built in

bi_cd:
        LDW X, [args]
        STW [errname], X
        LD A, [X]
        TST A
        JNZ .go
        CALL uid
        LDW X, #t_home
        CALL pick
        STW [errname], X
.go:    SYS SYS_CHDIR
        TST A
        JNZ err
        RET

bi_pwd:
        LDW X, #cwdbuf
        SYS SYS_GETCWD
        LDW X, #cwdbuf
        CALL puts
        JMP newline

; echo: its arguments, with the quotes taken off (as a shell would).
bi_echo:
        LDW X, [args]
        MOV A, #0
        ST [inq], A
.ch:    LD A, [X]
        TST A
        JZ .end
        INCW X
        LD B, [inq]
        TST B
        JZ .out
        ; inside quotes: only the same quote closes them
        CMP A, B
        JNZ .put
        MOV B, #0
        ST [inq], B
        JMP .ch
.out:   CMP A, #'"'
        JZ .opn
        CMP A, #$27
        JNZ .put
.opn:   ST [inq], A
        JMP .ch
.put:   PUSHW X
        CALL putc
        POPW X
        JMP .ch
.end:   JMP newline

bi_clear:
        LDW X, #s_cls
        JMP puts

bi_exit:
        LDW X, #m_notdone
        JMP putmsg

bi_help:
        LDW X, #pathbuf
        LDW Y, #s_help
        CALL strcpy
        LDW Y, #s_en
        CALL is_pt
        JZ .l
        LDW Y, #s_pt
.l:     CALL strcpy
        LDW X, #pathbuf
        JMP catfile

bi_history:
        LDW X, #history
        CALL puts
        JMP newline

; ---------------------------------------------------------------- data

builtins:
        .dw c_cd, bi_cd, c_pwd, bi_pwd, c_echo, bi_echo, c_clear, bi_clear
        .dw c_exit, bi_exit, c_logout, bi_exit, c_help, bi_help, c_history, bi_history, 0
c_cd:       .db "cd", 0
c_pwd:      .db "pwd", 0
c_echo:     .db "echo", 0
c_clear:    .db "clear", 0
c_exit:     .db "exit", 0
c_logout:   .db "logout", 0
c_help:     .db "help", 0
c_history:  .db "history", 0

t_user:     .dw u_root, u_vis, u_caixa
t_host:     .dw h_root, h_vis, h_caixa
t_home:     .dw home_root, home_vis, home_caixa
t_path:     .dw path_root, path_vis, path_caixa
t_pipe:     .dw pipe0, pipe1
path_root:  .dw d_bin, d_sbin, d_games, 0
path_vis:   .dw d_bin, d_games, 0
path_caixa: .dw d_caixa, 0
u_root:     .db "root", 0
u_vis:      .db "visitante", 0
u_caixa:    .db "caixa", 0
h_root:     .db "maquinas", 0
h_vis:      .db "cabine", 0
h_caixa:    .db "bilheteria", 0
home_root:  .db "/root", 0
home_vis:   .db "/home/visitante", 0
home_caixa: .db "/opt/caixa", 0
d_bin:      .db "/bin", 0
d_sbin:     .db "/sbin", 0
d_games:    .db "/usr/games", 0
d_caixa:    .db "/opt/caixa/bin", 0
pipe0:      .db "/tmp/.pipe0", 0
pipe1:      .db "/tmp/.pipe1", 0
s_login:    .db "-l", 0
s_motd:     .db "/etc/motd.", 0
s_help:     .db "/etc/help.", 0
s_en:       .db "en", 0
s_pt:       .db "pt", 0
s_sh:       .db "sh: ", 0
s_colon:    .db ": ", 0
s_c_user:   .db "\e[33m", 0
s_c_path:   .db "\e[0m:\e[36m", 0
s_c_off:    .db "\e[0m", 0
s_cls:      .db "\e[2J\e[H", 0
s_bs:       .db "\b \b", 0
s_ctrlc:    .db "^C\n", 0

t_err:      .dw m_e0, m_e1, m_e2, m_e3, m_e4, m_e5, m_e6, m_e7, m_e8, m_e9, m_e10, m_e11, m_e0

; data, zeroed
llen:       .db 0
inq:        .db 0
bg:         .db 0
nstage:     .db 0
si:         .db 0
cfd:        .db 0
out_mode:   .db 0
want_fd:    .db 0
tmp_fd:     .db 0
cur:        .dw 0
args:       .dw 0
pp:         .dw 0
errname:    .dw 0
in_name:    .dw 0
out_name:   .dw 0
stage0:     .dw 0, 0, 0
cmd:        .ds 32
pathbuf:    .ds 64
cwdbuf:     .ds 64
statbuf:    .ds 32
line:       .ds LINE_MAX + 2
history:    .ds LINE_MAX + 2
iobuf:      .ds 96

.include "lib/libgl.s"

        MSG m_notfound, "command not found\n", "comando não encontrado\n"
        MSG m_notdone, "You're not done.\n", "Você não terminou.\n"
        MSG m_e0, "failed\n", "falhou\n"
        MSG m_e1, "no such file or directory\n", "arquivo ou diretório inexistente\n"
        MSG m_e2, "permission denied\n", "permissão negada\n"
        MSG m_e3, "not a directory\n", "não é um diretório\n"
        MSG m_e4, "is a directory\n", "é um diretório\n"
        MSG m_e5, "cannot execute\n", "não é executável\n"
        MSG m_e6, "out of memory (8 processes, 11 slots)\n", "sem memória (8 processos, 11 slots)\n"
        MSG m_e7, "bad file descriptor\n", "descritor inválido\n"
        MSG m_e8, "already exists\n", "já existe\n"
        MSG m_e9, "disk full\n", "disco cheio\n"
        MSG m_e10, "busy\n", "ocupado\n"
        MSG m_e11, "directory not empty\n", "diretório não vazio\n"
