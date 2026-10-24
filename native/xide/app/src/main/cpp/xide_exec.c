/* Start app-private ELFs without asking linker64 to accept program flags.
   Android 10+ returns EACCES (error 13) for exec of files under the app's
   data dir. Some newer linkers also reject `linker64 <elf> -version`
   with "expected absolute path: -version" because every linker argument
   must be an absolute path. Copy the ELF to a memfd and exec that, so the
   kernel loads linker64 as the interpreter and the real argv stays intact. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

extern char** environ;

#ifndef __NR_memfd_create
#define __NR_memfd_create 279
#endif
#ifndef __NR_execveat
#define __NR_execveat 281
#endif
#ifndef AT_EMPTY_PATH
#define AT_EMPTY_PATH 0x1000
#endif

static int elf_class(const char* path) {
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    unsigned char m[5];
    int n;
    if (fd < 0) return 0;
    n = (int)read(fd, m, 5);
    close(fd);
    if (n < 5 || m[0] != 0x7f || m[1] != 'E' || m[2] != 'L' || m[3] != 'F') return 0;
    return m[4] == 2 ? 64 : 32;
}

static int should_wrap(const char* path) {
    if (!path || path[0] != '/') return 0;
    if (strcmp(path, "/system/bin/linker64") == 0) return 0;
    if (strcmp(path, "/system/bin/linker") == 0) return 0;
    if (strcmp(path, "/system/bin/sh") == 0) return 0;
    if (strncmp(path, "/system/", 8) == 0) return 0;
    if (strncmp(path, "/apex/", 6) == 0) return 0;
    if (strncmp(path, "/vendor/", 8) == 0) return 0;
    if (strncmp(path, "/product/", 9) == 0) return 0;
    if (strstr(path, "/lib/arm64/") != NULL) return 0;
    if (strstr(path, "/lib/arm/") != NULL) return 0;
    return strncmp(path, "/data/", 6) == 0 || strncmp(path, "/mnt/", 5) == 0;
}

static const char* linker_for(int cls) {
    if (cls == 32 && access("/system/bin/linker", X_OK) == 0) return "/system/bin/linker";
    return "/system/bin/linker64";
}

static int copy_memfd(const char* path) {
    int in = open(path, O_RDONLY | O_CLOEXEC);
    int out;
    char buf[65536];
    ssize_t n;
    if (in < 0) return -1;
    out = (int)syscall(__NR_memfd_create, "xide", 0);
    if (out < 0) {
        close(in);
        return -1;
    }
    while ((n = read(in, buf, sizeof(buf))) > 0) {
        ssize_t off = 0;
        while (off < n) {
            ssize_t w = write(out, buf + off, (size_t)(n - off));
            if (w < 0) {
                close(in);
                close(out);
                return -1;
            }
            off += w;
        }
    }
    close(in);
    if (n < 0) {
        close(out);
        return -1;
    }
    if (lseek(out, 0, SEEK_SET) < 0) {
        close(out);
        return -1;
    }
    return out;
}

static int exec_memfd(const char* path, char* const argv[], char* const envp[]) {
    int fd = copy_memfd(path);
    int err;
    char proc[64];
    if (fd < 0) return -1;
    syscall(__NR_execveat, fd, "", argv, envp, AT_EMPTY_PATH);
    err = errno;
    snprintf(proc, sizeof(proc), "/proc/self/fd/%d", fd);
    execve(proc, argv, envp);
    errno = err ? err : errno;
    close(fd);
    return -1;
}

static char** dup_argv_shift(char* const argv[], const char* a0, const char* a1) {
    int argc = 0;
    int i;
    char** na;
    while (argv && argv[argc]) argc++;
    na = (char**)malloc((size_t)(argc + 3) * sizeof(char*));
    if (!na) return NULL;
    na[0] = (char*)a0;
    na[1] = (char*)a1;
    for (i = 1; i < argc; i++) na[i + 1] = argv[i];
    na[argc + 1] = NULL;
    return na;
}

static void map_shebang(const char* raw, char* out, size_t outsz) {
    if (strcmp(raw, "/bin/sh") == 0 || strcmp(raw, "/usr/bin/sh") == 0 || strcmp(raw, "/usr/bin/env") == 0) {
        snprintf(out, outsz, "/system/bin/sh");
        return;
    }
    snprintf(out, outsz, "%s", raw);
}

static int exec_script(const char* path, char* const argv[], char* const envp[]) {
    FILE* f = fopen(path, "r");
    char line[256];
    char interp[256];
    char* sp;
    char** na;
    int rc;
    if (!f) return -1;
    if (!fgets(line, sizeof(line), f)) {
        fclose(f);
        return -1;
    }
    fclose(f);
    if (strncmp(line, "#!", 2) != 0) {
        snprintf(interp, sizeof(interp), "/system/bin/sh");
    } else {
        char* p = line + 2;
        while (*p == ' ' || *p == '\t') p++;
        sp = strpbrk(p, " \t\r\n");
        if (sp) *sp = 0;
        map_shebang(p, interp, sizeof(interp));
    }
    na = dup_argv_shift(argv, interp, path);
    if (!na) return -1;
    if (should_wrap(interp)) rc = exec_memfd(interp, na, envp);
    else rc = execve(interp, na, envp);
    free(na);
    return rc;
}

static int exec_private(const char* path, char* const argv[], char* const envp[]) {
    int cls = elf_class(path);
    int mem_err;
    char** na;
    const char* linker;
    if (cls == 0) return exec_script(path, argv, envp);
    exec_memfd(path, argv, envp);
    mem_err = errno;
    linker = linker_for(cls);
    na = dup_argv_shift(argv, linker, path);
    if (!na) {
        errno = mem_err;
        return -1;
    }
    execve(linker, na, envp);
    fprintf(stderr, "xide: memfd errno %d, linker errno %d\n", mem_err, errno);
    free(na);
    errno = mem_err;
    return -1;
}

static int (*real_execve)(const char*, char* const[], char* const[]);

int execve(const char* path, char* const argv[], char* const envp[]) {
    if (!real_execve) real_execve = dlsym(RTLD_NEXT, "execve");
    if (!should_wrap(path)) return real_execve(path, argv, envp);
    exec_private(path, argv, envp ? envp : environ);
    return -1;
}

int execv(const char* path, char* const argv[]) {
    return execve(path, argv, environ);
}

static char* resolve_path(const char* file) {
    const char* path;
    char* copy;
    char* save = NULL;
    char* dir;
    char buf[1024];
    if (!file) return NULL;
    if (strchr(file, '/')) return strdup(file);
    path = getenv("PATH");
    if (!path) path = "/system/bin";
    copy = strdup(path);
    if (!copy) return NULL;
    for (dir = strtok_r(copy, ":", &save); dir; dir = strtok_r(NULL, ":", &save)) {
        snprintf(buf, sizeof(buf), "%s/%s", dir, file);
        if (access(buf, F_OK) == 0) {
            free(copy);
            return strdup(buf);
        }
    }
    free(copy);
    return NULL;
}

int execvp(const char* file, char* const argv[]) {
    char* full = resolve_path(file);
    int rc;
    if (full && should_wrap(full)) {
        rc = execve(full, argv, environ);
        free(full);
        return rc;
    }
    free(full);
    return execvpe(file, argv, environ);
}

static int (*real_posix_spawn)(pid_t*, const char*, const posix_spawn_file_actions_t*,
                               const posix_spawnattr_t*, char* const[], char* const[]);

int posix_spawn(pid_t* pid, const char* path, const posix_spawn_file_actions_t* actions,
                 const posix_spawnattr_t* attr, char* const argv[], char* const envp[]) {
    if (!real_posix_spawn) real_posix_spawn = dlsym(RTLD_NEXT, "posix_spawn");
    if (!should_wrap(path) || actions || attr) {
        return real_posix_spawn(pid, path, actions, attr, argv, envp);
    }
    pid_t child = fork();
    if (child < 0) return errno;
    if (child == 0) {
        execve(path, argv, envp ? envp : environ);
        _exit(127);
    }
    if (pid) *pid = child;
    return 0;
}

__attribute__((constructor)) static void xide_exec_init(void) {
    const char* mark = getenv("XIDE_SHIM_MARK");
    FILE* f;
    if (!mark || !mark[0]) return;
    f = fopen(mark, "w");
    if (!f) return;
    fputs("loaded\n", f);
    fclose(f);
}

#ifdef XIDE_RUNNER
int main(int argc, char** argv) {
    if (argc < 2 || !argv[1] || argv[1][0] != '/') {
        fprintf(stderr, "xide-run: need an absolute program path\n");
        return 2;
    }
    exec_private(argv[1], argv + 1, environ);
    fprintf(stderr, "xide-run: cannot start %s: %s\n", argv[1], strerror(errno));
    return 127;
}
#endif
