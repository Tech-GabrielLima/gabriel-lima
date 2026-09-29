; man COMMAND   /usr/man/<lang>/<command>
.include "inc/gl1.inc"
        .relocatable
start:  CALL skipsp
        LD A, [X]
        TST A
        JZ .what
        STW [topic], X
        LDW X, #path
        LDW Y, #base
        CALL strcpy
        LDW Y, #en
        CALL is_pt
        JZ .l
        LDW Y, #pt
.l:     CALL strcpy
        LDW Y, [topic]
        CALL strcpy
        LDW X, #path
        MOV B, #0
        SYS SYS_OPEN
        TST A
        JNZ .none
        MOV A, XL
        ST [fd], A
.rd:    LD B, [fd]
        LDW X, #buf
        LDW Y, #128
        SYS SYS_READ
        CMPW X, #0
        JZ .done
        MOVW Y, X
        LDW X, #buf
        MOV B, #1
        SYS SYS_WRITE
        JMP .rd
.done:  MOV B, #0
        SYS SYS_EXIT
.what:  LDW X, #m_what
        CALL putmsg
        MOV B, #1
        SYS SYS_EXIT
.none:  LDW X, #m_none
        CALL putmsg
        LDW X, [topic]
        CALL puts
        CALL newline
        MOV B, #1
        SYS SYS_EXIT
base:   .db "/usr/man/", 0
en:     .db "en/", 0
pt:     .db "pt/", 0
topic:  .dw 0
fd:     .db 0
path:   .ds 64
buf:    .ds 128
.include "lib/libgl.s"
        MSG m_what, "What manual page do you want? (try: man intro)\n", "Qual página do manual? (tente: man intro)\n"
        MSG m_none, "No manual entry for ", "Não há manual para "
