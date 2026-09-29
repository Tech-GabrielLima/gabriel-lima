; GL-1 BIOS. 4 KB of ROM at $F000.
;
; On reset: point every interrupt vector at a trampoline in RAM (so the
; kernel can take them over), say hello, read the boot block, load the kernel
; it names and jump into it. Nothing here knows GLFS: the boot block says
; where the kernel is.

.include "inc/gl1.inc"

; The ROM can't be written: its variables live in RAM, below the kernel.
k_sec   = KVARS
k_count = KVARS + 2
k_entry = KVARS + 4

        .org $F000

reset:
        DI
        LDW SP, #$E000
        ; 16 trampolines: JMP unhandled
        LDW X, #TRAMPOLINES
        LDW Y, #unhandled
        MOV C, #16
.tramp: MOV A, #$50
        ST [X], A
        STW [X+1], Y
        ADDW X, #3
        DEC C
        JNZ .tramp

        LDW X, #banner
        CALL puts
        ; What's in the box.
        LDW X, #s_disk
        CALL puts
        IN A, #P_DISK_SIZE_LO
        MOV XL, A
        IN A, #P_DISK_SIZE_HI
        MOV XH, A
        CALL putdec
        LDW X, #s_sectors
        CALL puts

        ; Boot block → the sector buffer.
        LDW X, #0
        LDW Y, #SECBUF
        CALL rdsec
        LD A, [SECBUF]
        CMP A, #'G'
        JNZ nodisk
        LD A, [SECBUF+1]
        CMP A, #'L'
        JNZ nodisk

        LDW X, #s_boot
        CALL puts
        ; kernel: sector [4], count [6], load [8], entry [10]
        LDW X, [SECBUF+4]
        STW [k_sec], X
        LDW X, [SECBUF+6]
        STW [k_count], X
        LDW X, [SECBUF+10]
        STW [k_entry], X
        LDW Y, [SECBUF+8]
.load:  LDW X, [k_count]
        CMPW X, #0
        JZ .go
        DECW X
        STW [k_count], X
        LDW X, [k_sec]
        CALL rdsec
        INCW X
        STW [k_sec], X
        ADDW Y, #512
        MOV A, #'.'
        OUT #P_CON_OUT, A
        JMP .load
.go:    LDW X, #s_nl
        CALL puts
        LDW X, [k_entry]
        JMPW X

nodisk:
        LDW X, #s_nodisk
        CALL puts
.halt:  HLT
        JMP .halt

unhandled:
        LDW X, #s_unhandled
        CALL puts
        JMP nodisk.halt

; rdsec: sector X → memory at Y (512 bytes). Keeps X and Y.
rdsec:
        MOV A, XL
        OUT #P_DISK_SEC_LO, A
        MOV A, XH
        OUT #P_DISK_SEC_HI, A
        MOV A, YL
        OUT #P_DISK_DMA_LO, A
        MOV A, YH
        OUT #P_DISK_DMA_HI, A
        MOV A, #1
        OUT #P_DISK_CMD, A
        RET

; puts: the NUL-terminated string at X.
puts:
        LD A, [X]
        TST A
        JZ .done
        OUT #P_CON_OUT, A
        INCW X
        JMP puts
.done:  RET

; putdec: X as a decimal number.
putdec:
        MOV D, #0               ; a digit has been printed
        LDW Y, #10000
        CALL .digit
        LDW Y, #1000
        CALL .digit
        LDW Y, #100
        CALL .digit
        LDW Y, #10
        CALL .digit
        MOV D, #1
        LDW Y, #1
.digit: MOV C, #'0'
.sub:   CMPW X, Y
        JC .out
        SUBW X, Y
        INC C
        JMP .sub
.out:   CMP C, #'0'
        JNZ .show
        TST D
        JZ .skip
.show:  OUT #P_CON_OUT, C
        MOV D, #1
.skip:  RET


banner:
        .db "\e[2J\e[H\e[33mGL-1\e[0m  BIOS v1.0  \e[90m(c) 2026 Gabriel Lima\e[0m\r\n"
        .db "CPU GL-1 8-bit @ 8 MHz   RAM 56 KB   VRAM 4 KB   ROM 4 KB\r\n", 0
s_disk:     .db "Disk ", 0
s_sectors:  .db " sectors\r\n", 0
s_boot:     .db "Booting GL-OS ", 0
s_nl:       .db "\r\n", 0
s_nodisk:   .db "\r\nNo bootable disk. Insert the reel and press reset.\r\n", 0
s_unhandled: .db "\r\n\e[31mUnhandled interrupt.\e[0m\r\n", 0

; ---------------------------------------------------------------- vectors
        .org $FFE0
        .dw reset                       ; 0 reset
        .dw TRAMPOLINES + 3             ; 1 (unused)
        .dw TRAMPOLINES + 6             ; 2 illegal instruction
        .dw TRAMPOLINES + 9             ; 3 BRK
        .dw TRAMPOLINES + 12            ; 4 SWI (syscalls)
        .dw TRAMPOLINES + 15            ; 5 IRQ 0 timer
        .dw TRAMPOLINES + 18            ; 6 IRQ 1 keyboard
        .dw TRAMPOLINES + 21            ; 7 IRQ 2
        .dw TRAMPOLINES + 24            ; 8 IRQ 3 card
        .dw TRAMPOLINES + 27            ; 9 IRQ 4 host
        .dw TRAMPOLINES + 30
        .dw TRAMPOLINES + 33
        .dw TRAMPOLINES + 36
        .dw TRAMPOLINES + 39
        .dw TRAMPOLINES + 42
        .dw TRAMPOLINES + 45
