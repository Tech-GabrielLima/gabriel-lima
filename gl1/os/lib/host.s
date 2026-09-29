; Talking to the host (the world outside the machine).

; X = message to the host → hostbuf holds the reply, X = its length.
host:
        LDW Y, #hostbuf
        MOV C, #<HOSTBUF_SIZE
        MOV D, #>HOSTBUF_SIZE
        SYS SYS_HOST
        RET

hostbuf: .ds HOSTBUF_SIZE
