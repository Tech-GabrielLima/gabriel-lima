; pipoca: the lobby arcade's game (ROTEIRO §0.4.4, frame 6).
; Catch the popcorn in the bucket. Three misses and the session is over.
; Graphics mode: 160x100 at 2 bits per pixel in VRAM, 40 bytes a row, four
; pixels a byte (the leftmost in the high bits). Everything is drawn in whole
; bytes, so a column here is four pixels wide.
; The palette (the host's): 0 the dark, 1 red, 2 cream, 3 amber.
.include "inc/gl1.inc"
        .relocatable
VEND    = $EFA0
TOP     = 90                    ; the popcorn meets the bucket here
start:  MOV A, #1
        OUT #P_DISP_MODE, A
        MOV A, #0
        ST [score], A
        ST [miss], A
        MOV A, #1
        ST [speed], A
        MOV A, #18
        ST [bx], A
        CALL spawn

loop:   CALL clear
        MOV A, #0
        OUT #P_TONE, A
        ; the buttons: B or start leaves, left and right move the bucket
        IN A, #P_PAD
        ST [pad], A
        AND A, #$60
        JNZ over
        LD A, [pad]
        AND A, #1
        JZ .nl
        LD A, [bx]
        TST A
        JZ .nl
        DEC A
        ST [bx], A
.nl:    LD A, [pad]
        AND A, #2
        JZ .nr
        LD A, [bx]
        CMP A, #37
        JNC .nr
        INC A
        ST [bx], A
.nr:    ; the popcorn falls
        LD A, [py]
        LD B, [speed]
        ADD A, B
        ST [py], A
        CMP A, #TOP
        JC .draw
        ; at the rim: caught if bx <= px <= bx + 2
        LD A, [px]
        LD B, [bx]
        CMP A, B
        JC .miss
        ADD B, #2
        CMP B, A
        JC .miss
        LD A, [score]
        INC A
        ST [score], A
        ; faster every four: speed = 1 + score / 4, at most 4
        SHR A
        SHR A
        INC A
        CMP A, #5
        JC .sp
        MOV A, #4
.sp:    ST [speed], A
        MOV A, #84
        OUT #P_TONE, A
        CALL spawn
        JMP .draw
.miss:  MOV A, #40
        OUT #P_TONE, A
        CALL spawn
        LD A, [miss]
        INC A
        ST [miss], A
        CMP A, #3
        JNC over

.draw:  ; the popcorn: one column, three rows, cream
        MOV A, #$AA
        ST [ink], A
        LD A, [py]
        LD B, [px]
        MOV C, #1
        MOV D, #3
        CALL block
        ; the bucket: an amber rim over red and cream stripes
        MOV A, #$FF
        ST [ink], A
        MOV A, #92
        LD B, [bx]
        MOV C, #3
        MOV D, #1
        CALL block
        MOV A, #$66
        ST [ink], A
        MOV A, #93
        LD B, [bx]
        MOV C, #3
        MOV D, #6
        CALL block
        ; the score: an amber bar along the top, a column per point
        LD A, [score]
        TST A
        JZ .nos
        CMP A, #41
        JC .sw
        MOV A, #40
.sw:    MOV C, A
        MOV A, #$FF
        ST [ink], A
        MOV A, #1
        MOV B, #0
        MOV D, #2
        CALL block
.nos:   ; the misses: red, top right
        LD A, [miss]
        TST A
        JZ .flip
        MOV C, A
        MOV A, #40
        SUB A, C
        MOV B, A
        MOV A, #$55
        ST [ink], A
        MOV A, #5
        MOV D, #2
        CALL block
.flip:  OUT #P_DISP_FLIP, A
        LDW X, #33
        SYS SYS_SLEEP
        JMP loop

over:   MOV A, #0
        OUT #P_TONE, A
        OUT #P_DISP_MODE, A
        LDW X, #m_score
        CALL putmsg
        MOV XH, #0
        LD A, [score]
        MOV XL, A
        CALL putdec
        CALL newline
        LD A, [score]
        TST A
        JZ .bye
        LDW X, #f_arcade
        CALL host
.bye:   MOV B, #0
        SYS SYS_EXIT

; A new piece of popcorn at the top, in a random column.
spawn:  IN A, #P_RNG
.m:     CMP A, #40
        JC .ok
        SUB A, #40
        JMP .m
.ok:    ST [px], A
        MOV A, #0
        ST [py], A
        RET

clear:  LDW X, #VRAM
        MOV A, #0
.c:     ST [X], A
        INCW X
        CMPW X, #VEND
        JNZ .c
        RET

; A = row, B = column, C = width in columns, D = height in rows, [ink] = the byte.
block:  LDW X, #VRAM
        TST A
        JZ .at
.r:     ADDW X, #40
        DEC A
        JNZ .r
.at:    ADDW X, B
.row:   PUSHW X
        LD A, [ink]
        MOV B, C
.col:   ST [X], A
        INCW X
        DEC B
        JNZ .col
        POPW X
        ADDW X, #40
        DEC D
        JNZ .row
        RET

score:  .db 0
miss:   .db 0
speed:  .db 1
bx:     .db 18
px:     .db 0
py:     .db 0
pad:    .db 0
ink:    .db 0
f_arcade: .db "frame arcade", 0
.include "lib/libgl.s"
.include "lib/host.s"
        MSG m_score, "PIPOCA  score: ", "PIPOCA  pontos: "
