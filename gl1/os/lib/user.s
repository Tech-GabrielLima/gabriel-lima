; Who's who.

; A = uid → X = the user's name.
username:
        CMP A, #3
        JC .ok
        MOV A, #1
.ok:    SHL A
        LDW X, #users
        ADDW X, A
        LDW X, [X]
        RET
users:  .dw user_root, user_vis, user_caixa
user_root:  .db "root", 0
user_vis:   .db "visitante", 0
user_caixa: .db "caixa", 0

; → A = the caller's uid.
getuid:
        SYS SYS_GETUID
        MOV A, XL
        RET
