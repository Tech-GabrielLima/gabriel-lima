; GLFS in the kernel: sectors, inodes, paths, files, and their syscalls.

; ---------------------------------------------------------------- sectors

k_read_bootblock:
        LDW X, #0
        CALL k_disk_read
        LDW X, [SECBUF+12]
        STW [inode_sec], X
        LDW X, [SECBUF+18]
        STW [free_sec], X
        LDW X, [SECBUF+20]
        STW [total_sec], X
        RET

; The next free sector, back into the boot block.
k_bb_store:
        LDW X, #0
        CALL k_disk_read
        LDW X, [free_sec]
        STW [SECBUF+18], X
        LDW X, #0
        JMP k_disk_write

; X = sector → SECBUF (unless it's already there). Keeps X and Y.
k_disk_read:
        IN A, #P_DISK_CHANGED
        TST A
        JNZ .go
        LD A, [sec_cache]
        CMP A, XL
        JNZ .go
        LD A, [sec_cache+1]
        CMP A, XH
        JNZ .go
        RET
.go:    CALL k_disk_setup
        MOV A, #1
        OUT #P_DISK_CMD, A
        STW [sec_cache], X
        RET

; SECBUF → sector X. Keeps X and Y.
k_disk_write:
        CALL k_disk_setup
        MOV A, #2
        OUT #P_DISK_CMD, A
        STW [sec_cache], X
        RET

k_disk_setup:
        MOV A, XL
        OUT #P_DISK_SEC_LO, A
        MOV A, XH
        OUT #P_DISK_SEC_HI, A
        MOV A, #<SECBUF
        OUT #P_DISK_DMA_LO, A
        MOV A, #>SECBUF
        OUT #P_DISK_DMA_HI, A
        RET

; ---------------------------------------------------------------- inodes

; X = inode → Y = it, inside SECBUF; [ino_sec] = its sector. Keeps C, D, X.
k_inode_ptr:
        PUSHW X
        MOV A, XL
        MOV B, XH
        SHR B
        ROR A
        SHR B
        ROR A
        SHR B
        ROR A
        SHR B
        ROR A
        MOV XL, A
        MOV XH, B
        ADDXM inode_sec
        STW [ino_sec], X
        CALL k_disk_read
        POPW X
        MOV A, XL
        AND A, #15
        MOV B, A
        LDW Y, #SECBUF
.m:     TST B
        JZ .d
        ADDW Y, #32
        DEC B
        JMP .m
.d:     RET

; The inode in SECBUF goes back to disk.
k_inode_write:
        LDW X, [ino_sec]
        JMP k_disk_write

; Y = inode, A = M_READ or M_WRITE → A = 0 if the current process may. Keeps Y.
k_may:
        MOV B, A
        LDW X, [curp]
        LD A, [X+P_UID]
        TST A
        JZ .ok
        LD C, [Y+I_OWNER]
        CMP A, C
        JZ .ok
        LD A, [Y+I_MODE]
        AND A, B
        JNZ .ok
        MOV A, #E_PERM
        RET
.ok:    MOV A, #0
        RET

; X = directory, name in lk_name → X = the child's inode, A = 0 (or E_NOENT).
k_find:
        STW [fd_dir], X
        LDW X, #1
.loop:  CMPW X, #INODES
        JNC .none
        STW [fd_i], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        TST A
        JZ .next
        LD A, [Y+I_PARENT]
        LD B, [fd_dir]
        CMP A, B
        JNZ .next
        LD A, [Y+I_PARENT+1]
        LD B, [fd_dir+1]
        CMP A, B
        JNZ .next
        LDW X, #lk_name
        CALL k_streq
        JZ .found
.next:  LDW X, [fd_i]
        INCW X
        JMP .loop
.found: LDW X, [fd_i]
        MOV A, #0
        RET
.none:  MOV A, #E_NOENT
        RET

; ---------------------------------------------------------------- paths

; Where a path starts: / or the current directory. X = path.
k_path_start:
        STW [lk_p], X
        LD A, [X]
        CMP A, #'/'
        JZ .abs
        LDW Y, [curp]
        LDW X, [Y+P_CWD]
        STW [lk_dir], X
        RET
.abs:   LDW X, #0
        STW [lk_dir], X
        RET

; The next component of [lk_p] → lk_name; A = 1, or 0 when the path is over.
; A path ends at NUL or a space (arguments may follow it).
k_next_comp:
        LDW Y, [lk_p]
.skip:  LD A, [Y]
        CMP A, #'/'
        JNZ .take
        INCW Y
        JMP .skip
.take:  TST A
        JZ .none
        CMP A, #' '
        JZ .none
        LDW X, #lk_name
        MOV C, #0
.cp:    LD A, [Y]
        TST A
        JZ .end
        CMP A, #'/'
        JZ .end
        CMP A, #' '
        JZ .end
        INCW Y
        CMP C, #19
        JNC .cp
        ST [X], A
        INCW X
        INC C
        JMP .cp
.end:   MOV A, #0
        ST [X], A
        STW [lk_p], Y
        MOV A, #1
        RET
.none:  STW [lk_p], Y
        MOV A, #0
        RET

; One step down from [lk_dir] into lk_name ("." and ".." too) → A = status.
k_step:
        LD A, [lk_name]
        CMP A, #'.'
        JNZ .find
        LD A, [lk_name+1]
        TST A
        JZ .same
        CMP A, #'.'
        JNZ .find
        LD A, [lk_name+2]
        TST A
        JNZ .find
        LDW X, [lk_dir]
        CALL k_inode_ptr
        LDW X, [Y+I_PARENT]
        STW [lk_dir], X
.same:  MOV A, #0
        RET
.find:  LDW X, [lk_dir]
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        CMP A, #K_DIR
        JNZ .notdir
        MOV A, #M_READ
        CALL k_may
        TST A
        JNZ .ret
        LDW X, [lk_dir]
        CALL k_find
        TST A
        JNZ .ret
        STW [lk_dir], X
.ret:   RET
.notdir: MOV A, #E_NOTDIR
        RET

; X = path → X = inode, A = status.
k_lookup:
        CALL k_path_start
.comp:  CALL k_next_comp
        TST A
        JZ .done
        CALL k_step
        TST A
        JZ .comp
        RET
.done:  LDW X, [lk_dir]
        MOV A, #0
        RET

; X = path → X = the directory it would live in, lk_name = its last part, A = status.
k_lookup_parent:
        CALL k_path_start
.loop:  CALL k_next_comp
        TST A
        JZ .noname
        ; Is this the last component?
        LDW Y, [lk_p]
.pk:    LD A, [Y]
        CMP A, #'/'
        JNZ .pk2
        INCW Y
        JMP .pk
.pk2:   TST A
        JZ .last
        CMP A, #' '
        JZ .last
        CALL k_step
        TST A
        JZ .loop
        RET
.last:  LDW X, [lk_dir]
        MOV A, #0
        RET
.noname:
        MOV A, #E_NOENT
        RET

; X = inode, Y = buffer → its absolute path, NUL-terminated.
k_path:
        STW [pt_buf], Y
        MOV C, #0
.up:    CMPW X, #0
        JZ .down
        CMP C, #10
        JNC .down
        LDW Y, #pt_stack
        ADDW Y, C
        ADDW Y, C
        STW [Y], X
        CALL k_inode_ptr
        LDW X, [Y+I_PARENT]
        INC C
        JMP .up
.down:  LDW X, [pt_buf]
        TST C
        JNZ .emit
        MOV A, #'/'
        ST [X], A
        INCW X
        JMP .nul
.emit:  DEC C
        MOV A, #'/'
        ST [X], A
        INCW X
        STW [pt_buf], X
        LDW Y, #pt_stack
        ADDW Y, C
        ADDW Y, C
        LDW X, [Y]
        CALL k_inode_ptr
        LDW X, [pt_buf]
.nm:    LD A, [Y]
        TST A
        JZ .nmd
        ST [X], A
        INCW X
        INCW Y
        JMP .nm
.nmd:   STW [pt_buf], X
        TST C
        JNZ .emit
.nul:   MOV A, #0
        ST [X], A
        RET

; ---------------------------------------------------------------- files

; X = open-file entry to fill from the inode at Y ([fi_inode] = its number). Keeps X, Y.
k_file_from_inode:
        LD A, [Y+I_KIND]
        ST [X+F_KIND], A
        LD A, [Y+I_SIZE]
        ST [X+F_SIZE], A
        LD A, [Y+I_SIZE+1]
        ST [X+F_SIZE+1], A
        LD A, [Y+I_SECTOR]
        ST [X+F_SECTOR], A
        LD A, [Y+I_SECTOR+1]
        ST [X+F_SECTOR+1], A
        LD A, [Y+I_CAP]
        ST [X+F_CAP], A
        LD A, [Y+I_CAP+1]
        ST [X+F_CAP+1], A
        LD A, [fi_inode]
        ST [X+F_INODE], A
        LD A, [fi_inode+1]
        ST [X+F_INODE+1], A
        MOV A, #0
        ST [X+F_POS], A
        ST [X+F_POS+1], A
        ST [X+F_FLAGS], A
        RET

; Read: [io_f] file, [io_buf], [io_len] → [io_done] bytes.
k_file_read:
        LDW X, #0
        STW [io_done], X
.loop:  LDW X, [io_len]
        CMPW X, #0
        JZ .end
        LDW Y, [io_f]
        LDW X, [Y+F_POS]
        STW [t_pos], X
        LDW X, [Y+F_SIZE]
        SUBXM t_pos
        JC .end
        CMPW X, #0
        JZ .end
        STW [t_left], X
        CALL k_file_sector
        CALL k_disk_read
        ; chunk = min(512 - offset, what's left, what's asked)
        LDW X, #512
        SUBXM t_off
        LDW Y, [t_left]
        CMPW X, Y
        JBE .c1
        MOVW X, Y
.c1:    LDW Y, [io_len]
        CMPW X, Y
        JBE .c2
        MOVW X, Y
.c2:    STW [t_chunk], X
        LDW X, #SECBUF
        ADDXM t_off
        MOVW Y, X
        LDW X, [io_buf]
        LD C, [t_chunk]
        LD D, [t_chunk+1]
        CALL k_copy
        STW [io_buf], X
        CALL k_advance
        JMP .loop
.end:   RET

; From [t_pos]: [t_off] = offset in its sector, X = the sector.
k_file_sector:
        LD A, [t_pos]
        ST [t_off], A
        LD A, [t_pos+1]
        AND A, #1
        ST [t_off+1], A
        LD A, [t_pos+1]
        SHR A
        LDW Y, [io_f]
        LDW X, [Y+F_SECTOR]
        ADDW X, A
        RET

; pos += chunk, len -= chunk, done += chunk.
k_advance:
        LDW X, [t_pos]
        ADDXM t_chunk
        LDW Y, [io_f]
        STW [Y+F_POS], X
        LDW X, [io_len]
        SUBXM t_chunk
        STW [io_len], X
        LDW X, [io_done]
        ADDXM t_chunk
        STW [io_done], X
        RET

; Write: [io_f] file, [io_buf], [io_len] → [io_done] bytes, A = status.
k_file_write:
        LDW X, #0
        STW [io_done], X
        LDW Y, [io_f]
        LDW X, [Y+F_POS]
        ADDXM io_len
        JC .full
        STW [t_need], X
        ; capacity in bytes = sectors << 9 (from 128 sectors up, it's all 64 KB)
        LDW Y, [io_f]
        LDW X, [Y+F_CAP]
        CMPW X, #128
        JNC .fits
        MOV A, XL
        SHL A
        MOV XH, A
        MOV XL, #0
        LDW Y, [t_need]
        CMPW X, Y
        JNC .fits
        CALL k_grow
        TST A
        JNZ .ret
.fits:
.loop:  LDW X, [io_len]
        CMPW X, #0
        JZ .done
        LDW Y, [io_f]
        LDW X, [Y+F_POS]
        STW [t_pos], X
        CALL k_file_sector
        STW [t_sec], X
        CALL k_disk_read
        LDW X, #512
        SUBXM t_off
        LDW Y, [io_len]
        CMPW X, Y
        JBE .c1
        MOVW X, Y
.c1:    STW [t_chunk], X
        LDW X, #SECBUF
        ADDXM t_off
        LDW Y, [io_buf]
        LD C, [t_chunk]
        LD D, [t_chunk+1]
        CALL k_copy
        STW [io_buf], Y
        LDW X, [t_sec]
        CALL k_disk_write
        CALL k_advance
        ; size = max(size, pos)
        LDW Y, [io_f]
        LDW X, [Y+F_POS]
        STW [t_pos], X
        LDW X, [Y+F_SIZE]
        LDW Y, [t_pos]
        CMPW X, Y
        JNC .loop
        LDW X, [io_f]
        STW [X+F_SIZE], Y
        JMP .loop
.done:  CALL k_sync_inode
        MOV A, #0
.ret:   RET
.full:  MOV A, #E_FULL
        RET

; The file outgrew its sectors: move it to the end of the disk, with room to spare.
k_grow:
        LDW X, [t_need]
        MOV A, XH
        SHR A
        ADD A, #2
        ST [g_cap], A
        MOV A, #0
        ST [g_cap+1], A
        LDW X, [free_sec]
        STW [g_new], X
        STW [g_dst], X
        ADDXM g_cap
        LDW Y, [total_sec]
        CMPW X, Y
        JA .full
        STW [free_sec], X
        LDW Y, [io_f]
        LDW X, [Y+F_CAP]
        STW [g_n], X
        LDW X, [Y+F_SECTOR]
        STW [g_src], X
.cp:    LDW X, [g_n]
        CMPW X, #0
        JZ .moved
        DECW X
        STW [g_n], X
        LDW X, [g_src]
        CALL k_disk_read
        INCW X
        STW [g_src], X
        LDW X, [g_dst]
        CALL k_disk_write
        INCW X
        STW [g_dst], X
        JMP .cp
.moved: LDW Y, [io_f]
        LDW X, [g_new]
        STW [Y+F_SECTOR], X
        LDW X, [g_cap]
        STW [Y+F_CAP], X
        CALL k_bb_store
        CALL k_sync_inode
        MOV A, #0
        RET
.full:  MOV A, #E_FULL
        RET

; [io_f]'s size, sector and capacity back into its inode.
k_sync_inode:
        LDW Y, [io_f]
        LDW X, [Y+F_INODE]
        CALL k_inode_ptr
        LDW X, [io_f]
        LD A, [X+F_SIZE]
        ST [Y+I_SIZE], A
        LD A, [X+F_SIZE+1]
        ST [Y+I_SIZE+1], A
        LD A, [X+F_SECTOR]
        ST [Y+I_SECTOR], A
        LD A, [X+F_SECTOR+1]
        ST [Y+I_SECTOR+1], A
        LD A, [X+F_CAP]
        ST [Y+I_CAP], A
        LD A, [X+F_CAP+1]
        ST [Y+I_CAP+1], A
        JMP k_inode_write

; A new inode in [cr_dir], named lk_name, of kind [cr_kind], owned by the
; current process → X = inode, A = status. Files get one sector to start.
k_create:
        LDW X, [free_sec]
        LDW Y, [total_sec]
        CMPW X, Y
        JNC .full
        LDW X, #1
.l:     CMPW X, #INODES
        JNC .full
        STW [cr_i], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        TST A
        JZ .got
        LDW X, [cr_i]
        INCW X
        JMP .l
.got:   STW [cr_at], Y
        MOVW X, Y
        LDW Y, #32
        CALL k_zero
        LDW X, [cr_at]
        LDW Y, #lk_name
        CALL k_strcpy
        LDW Y, [cr_at]
        LDW X, [cr_dir]
        STW [Y+I_PARENT], X
        LD A, [cr_kind]
        ST [Y+I_KIND], A
        LDW X, [curp]
        LD A, [X+P_UID]
        ST [Y+I_OWNER], A
        MOV A, #M_READ
        ST [Y+I_MODE], A
        LD A, [cr_kind]
        CMP A, #K_FILE
        JNZ .write
        LDW X, [free_sec]
        STW [Y+I_SECTOR], X
        LDW X, #1
        STW [Y+I_CAP], X
        CALL k_inode_write
        LDW X, [free_sec]
        INCW X
        STW [free_sec], X
        CALL k_bb_store
        JMP .done
.write: CALL k_inode_write
.done:  LDW X, [cr_i]
        MOV A, #0
        RET
.full:  MOV A, #E_FULL
        RET

; ---------------------------------------------------------------- descriptors

; [sb] = fd → X = its open-file entry, A = status.
k_fd_file:
        LD A, [sb]
        CMP A, #NFD
        JNC .bad
        LDW X, [curp]
        ADDW X, A
        LD A, [X+P_FD]
        CMP A, #$FF
        JZ .bad
        CALL k_file_ptr
        MOV A, #0
        RET
.bad:   MOV A, #E_BADF
        RET

; A = open-file index → X = its entry. Keeps A, C.
k_file_ptr:
        PUSH A
        LDW X, #FILES
        SHL A
        SHL A
        SHL A
        SHL A
        ADDW X, A
        POP A
        RET

; A = open-file index: one more / one less holder. The console is never counted. Keep C.
k_file_ref:
        CALL k_file_ptr
        LD A, [X+F_REF]
        CMP A, #$FF
        JZ .n
        INC A
        ST [X+F_REF], A
.n:     RET
k_file_unref:
        CALL k_file_ptr
        LD A, [X+F_REF]
        CMP A, #$FF
        JZ .n
        TST A
        JZ .n
        DEC A
        ST [X+F_REF], A
.n:     RET

; ---------------------------------------------------------------- syscalls

; X = path, B = 0 read / 1 write (create, truncate) / 2 append → X = fd.
sys_open:
        ; A descriptor in the process, reserved now ($FE) since we may wait.
        LDW X, [curp]
        MOV C, #0
.fd:    LD A, [X+P_FD]
        CMP A, #$FF
        JZ .gotfd
        INCW X
        INC C
        CMP C, #NFD
        JNZ .fd
        MOV A, #E_BADF
        RET
.gotfd: MOV A, #$FE
        ST [X+P_FD], A
        ST [op_fd], C
        ; An open-file entry, reserved the same way.
        MOV A, #0
        ST [op_fi], A
        MOV A, #1
.fe:    CALL k_file_ptr
        LD B, [X+F_REF]
        TST B
        JZ .gotfe
        INC A
        CMP A, #NFILES
        JNZ .fe
        MOV A, #E_NOMEM
        JMP .fail
.gotfe: ST [op_fi], A
        STW [op_f], X
        MOV B, #1
        ST [X+F_REF], B

        LD A, [sb]
        TST A
        JNZ .forwrite
        LDW X, [sx]
        CALL k_lookup
        TST A
        JNZ .fail
        STW [fi_inode], X
        CALL k_inode_ptr
        MOV A, #M_READ
        CALL k_may
        TST A
        JNZ .fail
        LDW X, [op_f]
        CALL k_file_from_inode
        LD A, [Y+I_KIND]
        CMP A, #K_DEV
        JNZ .install
        CALL k_dev_read
        LDW Y, [op_f]
        STW [Y+F_SIZE], X
        JMP .install

.forwrite:
        LDW X, [sx]
        CALL k_lookup
        TST A
        JZ .exists
        CMP A, #E_NOENT
        JNZ .fail
        LDW X, [sx]
        CALL k_lookup_parent
        TST A
        JNZ .fail
        STW [cr_dir], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        CMP A, #K_DIR
        JNZ .notdir
        MOV A, #M_WRITE
        CALL k_may
        TST A
        JNZ .fail
        MOV A, #K_FILE
        ST [cr_kind], A
        CALL k_create
        TST A
        JNZ .fail
.exists:
        STW [fi_inode], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        CMP A, #K_DIR
        JZ .isdir
        MOV A, #M_WRITE
        CALL k_may
        TST A
        JNZ .fail
        LDW X, [op_f]
        CALL k_file_from_inode
        MOV A, #FF_WRITE
        ST [X+F_FLAGS], A
        LD A, [Y+I_KIND]
        CMP A, #K_DEV
        JZ .install
        LD A, [sb]
        CMP A, #2
        JZ .append
        ; truncate
        MOV A, #0
        ST [X+F_SIZE], A
        ST [X+F_SIZE+1], A
        STW [io_f], X
        CALL k_sync_inode
        JMP .install
.append:
        LD A, [X+F_SIZE]
        ST [X+F_POS], A
        LD A, [X+F_SIZE+1]
        ST [X+F_POS+1], A

.install:
        LDW X, [curp]
        LD A, [op_fd]
        ADDW X, A
        LD A, [op_fi]
        ST [X+P_FD], A
        LD A, [op_fd]
        MOV XL, A
        MOV XH, #0
        MOV A, #0
        RET
.isdir: MOV A, #E_ISDIR
        JMP .fail
.notdir:
        MOV A, #E_NOTDIR
; Undo the reservations, keep the error.
.fail:  PUSH A
        LDW X, [curp]
        LD A, [op_fd]
        ADDW X, A
        MOV A, #$FF
        ST [X+P_FD], A
        LD A, [op_fi]
        TST A
        JZ .f2
        LDW X, [op_f]
        MOV A, #0
        ST [X+F_REF], A
.f2:    POP A
        RET

sys_close:
        CALL k_fd_file
        TST A
        JNZ .ret
        LD A, [sb]
        LDW X, [curp]
        ADDW X, A
        LD A, [X+P_FD]
        MOV B, #$FF
        ST [X+P_FD], B
        CALL k_file_unref
        MOV A, #0
.ret:   RET

; B = fd, X = buffer, Y = length → X = bytes read.
sys_read:
        CALL k_fd_file
        TST A
        JNZ .ret
        STW [io_f], X
        LD A, [X+F_KIND]
        CMP A, #FK_CON
        JZ .con
        CMP A, #FK_DIR
        JZ .isdir
        CMP A, #FK_DEV
        JZ .dev
        LDW X, [sx]
        STW [io_buf], X
        LDW X, [sy]
        STW [io_len], X
        CALL k_file_read
        LDW X, [io_done]
        MOV A, #0
.ret:   RET
.isdir: MOV A, #E_ISDIR
        RET
.con:   LDW X, [sy]
        CMPW X, #0
        JZ .zero
        CALL k_getkey
        LDW X, [sx]
        ST [X], A
        LDW X, #1
        MOV A, #0
        RET
.zero:  LDW X, #0
        MOV A, #0
        RET
.dev:   ; what the host said when the device was opened
        LDW Y, [io_f]
        LDW X, [Y+F_POS]
        STW [t_pos], X
        LDW X, [Y+F_SIZE]
        SUBXM t_pos
        JC .zero
        LDW Y, [sy]
        CMPW X, Y
        JBE .dn
        MOVW X, Y
.dn:    STW [t_chunk], X
        LDW X, #DEVBUF
        ADDXM t_pos
        MOVW Y, X
        LDW X, [sx]
        LD C, [t_chunk]
        LD D, [t_chunk+1]
        CALL k_copy
        LDW X, [t_pos]
        ADDXM t_chunk
        LDW Y, [io_f]
        STW [Y+F_POS], X
        LDW X, [t_chunk]
        MOV A, #0
        RET

; B = fd, X = buffer, Y = length → X = bytes written.
sys_write:
        CALL k_fd_file
        TST A
        JNZ .ret
        STW [io_f], X
        LD A, [X+F_KIND]
        CMP A, #FK_CON
        JZ .con
        CMP A, #FK_DIR
        JZ .isdir
        LD A, [X+F_FLAGS]
        AND A, #FF_WRITE
        JZ .badf
        LD A, [X+F_KIND]
        CMP A, #FK_DEV
        JZ .dev
        LDW X, [sx]
        STW [io_buf], X
        LDW X, [sy]
        STW [io_len], X
        CALL k_file_write
        LDW X, [io_done]
.ret:   RET
.isdir: MOV A, #E_ISDIR
        RET
.badf:  MOV A, #E_BADF
        RET
.con:   LDW X, [sx]
        LDW Y, [sy]
.cl:    CMPW Y, #0
        JZ .cd
        LD A, [X]
        OUT #P_CON_OUT, A
        INCW X
        DECW Y
        JMP .cl
.cd:    LDW X, [sy]
        MOV A, #0
        RET
.dev:   CALL k_dev_write
        LDW X, [sy]
        MOV A, #0
        RET

; B = char → stdout.
sys_putc:
        LD A, [sb]
        ST [pc_char], A
        MOV A, #1
        ST [sb], A
        LDW X, #pc_char
        STW [sx], X
        LDW X, #1
        STW [sy], X
        JMP sys_write

; → A = the next byte of stdin (a key, or a byte of a file), X = 1 at the end.
sys_getc:
        MOV A, #0
        ST [sb], A
        CALL k_fd_file
        TST A
        JNZ .eof
        LD A, [X+F_KIND]
        CMP A, #FK_CON
        JNZ .file
        CALL k_getkey
        LDW X, #0
        RET
.file:  LDW X, #pc_char
        STW [sx], X
        LDW X, #1
        STW [sy], X
        CALL sys_read
        CMPW X, #0
        JZ .eof
        LD A, [pc_char]
        LDW X, #0
        RET
.eof:   MOV A, #0
        LDW X, #1
        RET

; B = directory fd, Y = 32-byte buffer ← the next entry; A = 1 when there are no more.
sys_readdir:
        CALL k_fd_file
        TST A
        JNZ .ret
        STW [io_f], X
        LD A, [X+F_KIND]
        CMP A, #FK_DIR
        JNZ .notdir
        LDW X, [X+F_POS]
        CMPW X, #0
        JNZ .l
        INCW X
.l:     CMPW X, #INODES
        JNC .end
        STW [rd_i], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        TST A
        JZ .n
        LDW X, [io_f]
        LD A, [Y+I_PARENT]
        LD B, [X+F_INODE]
        CMP A, B
        JNZ .n
        LD A, [Y+I_PARENT+1]
        LD B, [X+F_INODE+1]
        CMP A, B
        JNZ .n
        LDW X, [sy]
        MOV C, #32
        MOV D, #0
        CALL k_copy
        LDW X, [rd_i]
        INCW X
        LDW Y, [io_f]
        STW [Y+F_POS], X
        MOV A, #0
.ret:   RET
.n:     LDW X, [rd_i]
        INCW X
        JMP .l
.end:   LDW Y, [io_f]
        STW [Y+F_POS], X
        MOV A, #1
        RET
.notdir:
        MOV A, #E_NOTDIR
        RET

; X = path, Y = 32-byte buffer ← its inode → X = the inode number.
sys_stat:
        LDW X, [sx]
        CALL k_lookup
        TST A
        JNZ .ret
        STW [rd_i], X
        CALL k_inode_ptr
        LDW X, [sy]
        MOV C, #32
        MOV D, #0
        CALL k_copy
        LDW X, [rd_i]
        MOV A, #0
.ret:   RET

sys_unlink:
        LDW X, [sx]
        CALL k_lookup
        TST A
        JNZ .ret
        CMPW X, #0
        JZ .perm
        STW [rd_i], X
        CALL k_inode_ptr
        LDW X, [curp]
        LD A, [X+P_UID]
        TST A
        JZ .may
        LD B, [Y+I_OWNER]
        CMP A, B
        JNZ .perm
.may:   LD A, [Y+I_KIND]
        CMP A, #K_DIR
        JNZ .gone
        ; a directory must be empty
        LDW X, #1
.ch:    CMPW X, #INODES
        JNC .gone
        STW [fd_i], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        TST A
        JZ .chn
        LD A, [Y+I_PARENT]
        LD B, [rd_i]
        CMP A, B
        JNZ .chn
        LD A, [Y+I_PARENT+1]
        LD B, [rd_i+1]
        CMP A, B
        JNZ .chn
        MOV A, #E_NOTEMPTY
        RET
.chn:   LDW X, [fd_i]
        INCW X
        JMP .ch
.gone:  LDW X, [rd_i]
        CALL k_inode_ptr
        MOV A, #K_FREE
        ST [Y+I_KIND], A
        CALL k_inode_write
        MOV A, #0
.ret:   RET
.perm:  MOV A, #E_PERM
        RET

sys_mkdir:
        LDW X, [sx]
        CALL k_lookup
        TST A
        JZ .exist
        LDW X, [sx]
        CALL k_lookup_parent
        TST A
        JNZ .ret
        STW [cr_dir], X
        CALL k_inode_ptr
        MOV A, #M_WRITE
        CALL k_may
        TST A
        JNZ .ret
        MOV A, #K_DIR
        ST [cr_kind], A
        CALL k_create
.ret:   RET
.exist: MOV A, #E_EXIST
        RET

sys_chdir:
        LDW X, [sx]
        CALL k_lookup
        TST A
        JNZ .ret
        STW [rd_i], X
        CALL k_inode_ptr
        LD A, [Y+I_KIND]
        CMP A, #K_DIR
        JNZ .notdir
        MOV A, #M_READ
        CALL k_may
        TST A
        JNZ .ret
        LDW X, [rd_i]
        LDW Y, [curp]
        STW [Y+P_CWD], X
        MOV A, #0
.ret:   RET
.notdir:
        MOV A, #E_NOTDIR
        RET

sys_getcwd:
        LDW Y, [curp]
        LDW X, [Y+P_CWD]
        LDW Y, [sx]
        CALL k_path
        MOV A, #0
        RET

; B = from, C = to: descriptor `to` becomes a copy of `from`.
sys_dup2:
        CALL k_fd_file
        TST A
        JNZ .ret
        LD A, [sc]
        CMP A, #NFD
        JNC .bad
        LD A, [sb]
        LDW X, [curp]
        ADDW X, A
        LD A, [X+P_FD]
        ST [op_fi], A
        LD A, [sc]
        LDW X, [curp]
        ADDW X, A
        LD A, [X+P_FD]
        CMP A, #$FF
        JZ .set
        CALL k_file_unref
.set:   LD A, [sc]
        LDW X, [curp]
        ADDW X, A
        LD A, [op_fi]
        ST [X+P_FD], A
        CALL k_file_ref
        MOV A, #0
.ret:   RET
.bad:   MOV A, #E_BADF
        RET

; B = fd → X = 1 if it's the console.
sys_isatty:
        CALL k_fd_file
        TST A
        JNZ .no
        LD A, [X+F_KIND]
        CMP A, #FK_CON
        JNZ .no
        LDW X, #1
        MOV A, #0
        RET
.no:    LDW X, #0
        MOV A, #0
        RET
