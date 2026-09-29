; Kernel-private layouts.

NPROC     = 8           ; process entries (a power of two: the scheduler masks with it)
PROC_SIZE = 32

; process entry
P_STATE   = 0
P_PID     = 1
P_PPID    = 2
P_UID     = 3
P_SLOT    = 4
P_CODE    = 5           ; the exit code of the child it waited for
P_SP      = 6           ; saved stack pointer (word)
P_CWD     = 8           ; current directory inode (word)
P_FD      = 10          ; 4 file descriptors → open-file index, $FF closed
P_NAME    = 14          ; 12 bytes, NUL-terminated
P_WAITPID = 26
P_WAKE    = 27          ; tick to wake at (word)

ST_FREE   = 0
ST_READY  = 1
ST_WAIT   = 3           ; waiting for a child to exit
ST_SLEEP  = 4

NFD       = 4

; open-file entry
NFILES    = 16
FILE_SIZE = 16
F_REF     = 0
F_KIND    = 1
F_INODE   = 2
F_POS     = 4
F_SIZE    = 6
F_SECTOR  = 8
F_CAP     = 10
F_FLAGS   = 12

FK_FILE   = 1
FK_DIR    = 2
FK_DEV    = 3
FK_CON    = 4

FF_WRITE  = 1

; inode (on disk and in SECBUF)
I_NAME    = 0
I_PARENT  = 20
I_KIND    = 22
I_OWNER   = 23
I_MODE    = 24
I_SIZE    = 26
I_SECTOR  = 28
I_CAP     = 30
INODES    = 512

DEFAULT_STACK = 512
DEVBUF_SIZE   = 1500
