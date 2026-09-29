; The usher. A process like any other: he walks the aisle, and every few
; seconds tells the house he's there. Kill him and the site's usher goes
; quiet; init brings him back.

.include "inc/gl1.inc"
        .relocatable

start:
        ; X = arguments: "voltei" when init brought him back
        LDW Y, #voltei
        CALL streq
        JNZ .walk
        LDW X, #m_back
        CALL host
.walk:  LDW X, #m_alive
        CALL host
        LDW X, #5000
        SYS SYS_SLEEP
        JMP .walk

voltei: .db "voltei", 0
m_alive: .db "usher alive", 0
m_back: .db "usher back", 0

.include "lib/libgl.s"
.include "lib/host.s"
