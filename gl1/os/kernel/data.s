; Kernel data. Everything here starts at zero.

lang:       .db 0
idle:       .db 0
host_busy:  .db 0
ticks:      .dw 0
cur:        .db 0
curp:       .dw 0
next_pid:   .db 0

; the current syscall's arguments
sa:         .db 0
sb:         .db 0
sc:         .db 0
sd:         .db 0
sx:         .dw 0
sy:         .dw 0

; the disk
inode_sec:  .dw 0
free_sec:   .dw 0
total_sec:  .dw 0
sec_cache:  .dw 0
ino_sec:    .dw 0

; paths
fd_dir:     .dw 0
fd_i:       .dw 0
lk_p:       .dw 0
lk_dir:     .dw 0
lk_name:    .ds 20
pt_buf:     .dw 0
pt_stack:   .ds 20

; files
fi_inode:   .dw 0
io_f:       .dw 0
io_buf:     .dw 0
io_len:     .dw 0
io_done:    .dw 0
t_pos:      .dw 0
t_left:     .dw 0
t_off:      .dw 0
t_chunk:    .dw 0
t_need:     .dw 0
t_sec:      .dw 0
g_cap:      .dw 0
g_new:      .dw 0
g_dst:      .dw 0
g_src:      .dw 0
g_n:        .dw 0
cr_dir:     .dw 0
cr_kind:    .db 0
cr_i:       .dw 0
cr_at:      .dw 0
op_fd:      .db 0
op_fi:      .db 0
op_f:       .dw 0
rd_i:       .dw 0
pc_char:    .db 0
dw_p:       .dw 0
dw_n:       .dw 0

; processes
sp_idx:     .db 0
sp_ptr:     .dw 0
sp_slot:    .db 0
sp_base:    .dw 0
sp_n:       .dw 0
sp_at:      .dw 0
sp_frame:   .dw 0
sp_pid:     .db 0
ld_f:       .ds FILE_SIZE
ld_hdr:     .ds 16
ld_word:    .dw 0
ex_p:       .dw 0
ex_code:    .db 0
ex_pid:     .db 0
ex_ppid:    .db 0

slots:      .ds SLOT_COUNT
PROCS:      .ds PROC_SIZE * NPROC
KPROC:      .ds PROC_SIZE
FILES:      .ds FILE_SIZE * NFILES
MSGBUF:     .ds 256
DEVBUF:     .ds DEVBUF_SIZE + 1

s_kernel:   .db "\e[33mGL-OS\e[0m 0.1 · kernel ok · 8 processes, 11 slots of 4 KB, 100 Hz\r\n", 0
s_init_path: .db "/sbin/init", 0
s_empty:    .db 0
s_noinit:   .db "\r\n\e[31mKernel panic:\e[0m no /sbin/init.\r\n", 0
s_initdied: .db "\r\n\e[31mKernel panic:\e[0m init died.\r\n", 0
s_illegal:  .db "\r\n\e[31mIllegal instruction\e[0m at ", 0
s_brk:      .db "\r\n\e[33mBreakpoint\e[0m at ", 0
s_in:       .db " in ", 0
s_crlf:     .db "\r\n", 0
