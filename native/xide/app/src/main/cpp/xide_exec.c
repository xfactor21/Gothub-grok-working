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
#include <limits.h>
#include <malloc.h>
#include <stdint.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

extern char** environ;

#ifndef __NR_memfd_create
#define __NR_memfd_create 279
#endif
#ifndef __NR_execveat
#define __NR_execveat 281
#endif
#ifndef MFD_EXEC
#define MFD_EXEC 0x0010
#endif
#ifndef MFD_CLOEXEC
#define MFD_CLOEXEC 0x0001
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
    /* Android 14+ defaults memfd to noexec. MFD_EXEC is required or execve returns EACCES. */
    out = (int)syscall(__NR_memfd_create, "xide", MFD_CLOEXEC | MFD_EXEC);
    if (out < 0 && errno == EINVAL) out = (int)syscall(__NR_memfd_create, "xide", MFD_CLOEXEC);
    if (out < 0 && errno == EINVAL) out = (int)syscall(__NR_memfd_create, "xide", 0);
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

static int args_are_paths(char* const argv[]) {
    int i;
    for (i = 1; argv && argv[i]; i++) {
        if (argv[i][0] != '/') return 0;
    }
    return 1;
}

static int exec_private(const char* path, char* const argv[], char* const envp[]) {
    int cls = elf_class(path);
    int mem_err;
    char** na;
    const char* linker;
    if (cls == 0) return exec_script(path, argv, envp);
    exec_memfd(path, argv, envp);
    mem_err = errno;
    fprintf(stderr, "xide: memfd exec failed errno %d (%s)\n", mem_err, strerror(mem_err));
    /* This phone's linker64 rejects any argument that is not an absolute path,
       so `linker64 java -version` can never work. Only retry that for path-only argv. */
    if (!args_are_paths(argv)) {
        errno = mem_err;
        return -1;
    }
    linker = linker_for(cls);
    na = dup_argv_shift(argv, linker, path);
    if (!na) {
        errno = mem_err;
        return -1;
    }
    execve(linker, na, envp);
    fprintf(stderr, "xide: linker errno %d (%s)\n", errno, strerror(errno));
    free(na);
    errno = mem_err;
    return -1;
}

static int is_java_bin(const char* path) {
    const char* base = path ? strrchr(path, '/') : NULL;
    base = base ? base + 1 : path;
    return base && strcmp(base, "java") == 0;
}

static int is_self_exe(const char* path) {
    if (!path) return 0;
    if (strcmp(path, "/proc/self/exe") == 0) return 1;
    if (strcmp(path, "/proc/thread-self/exe") == 0) return 1;
    return 0;
}

static ssize_t (*real_readlink)(const char*, char*, size_t);
static ssize_t (*real_readlinkat)(int, const char*, char*, size_t);

static ssize_t fake_self_exe(char* buf, size_t bufsiz) {
    const char* exe = getenv("XIDE_EXE");
    size_t n;
    if (!exe || exe[0] != '/') return -1;
    n = strlen(exe);
    if (n > bufsiz) n = bufsiz;
    memcpy(buf, exe, n);
    return (ssize_t)n;
}

ssize_t readlink(const char* path, char* buf, size_t bufsiz) {
    ssize_t n;
    if (!real_readlink) real_readlink = dlsym(RTLD_NEXT, "readlink");
    if (is_self_exe(path)) {
        n = fake_self_exe(buf, bufsiz);
        if (n >= 0) return n;
    }
    return real_readlink(path, buf, bufsiz);
}

ssize_t readlinkat(int dirfd, const char* path, char* buf, size_t bufsiz) {
    ssize_t n;
    if (!real_readlinkat) real_readlinkat = dlsym(RTLD_NEXT, "readlinkat");
    if ((dirfd == AT_FDCWD || dirfd < 0) && is_self_exe(path)) {
        n = fake_self_exe(buf, bufsiz);
        if (n >= 0) return n;
    }
    return real_readlinkat(dirfd, path, buf, bufsiz);
}

static char** env_set(char* const envp[], const char* key, const char* val) {
    int n = 0;
    int i;
    int replaced = 0;
    size_t klen = strlen(key);
    char* kv = NULL;
    char** out;
    if (asprintf(&kv, "%s=%s", key, val) < 0) return NULL;
    while (envp && envp[n]) n++;
    out = (char**)calloc((size_t)n + 2, sizeof(char*));
    if (!out) {
        free(kv);
        return NULL;
    }
    for (i = 0; i < n; i++) {
        if (!replaced && strncmp(envp[i], key, klen) == 0 && envp[i][klen] == '=') {
            out[i] = kv;
            replaced = 1;
        } else {
            out[i] = envp[i];
        }
    }
    if (!replaced) out[n++] = kv;
    out[n] = NULL;
    return out;
}

static int write_args(const char* dir, char* const argv[], char* out, size_t outsz) {
    static int seq;
    int fd;
    int i;
    snprintf(out, outsz, "%s/%d-%d.args", dir, (int)getpid(), ++seq);
    fd = open(out, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if (fd < 0) return -1;
    for (i = 1; argv && argv[i]; i++) {
        size_t n = strlen(argv[i]);
        char z = 0;
        if (write(fd, argv[i], n) != (ssize_t)n || write(fd, &z, 1) != 1) {
            close(fd);
            return -1;
        }
    }
    close(fd);
    return 0;
}

static int (*real_execve)(const char*, char* const[], char* const[]);

/* linker64 <program> only. Flags are not linker arguments on this phone.
   libxide-exec.so puts them back onto argv before main. */
static int exec_via_linker(const char* path, char* const argv[], char* const envp[]) {
    const char* dir = getenv("XIDE_ARGV_DIR");
    char argfile[512];
    char** ev;
    char* av[3];
    const char* linker;
    int cls = elf_class(path);
    if (!dir || dir[0] != '/') {
        fprintf(stderr, "xide: XIDE_ARGV_DIR missing\n");
        errno = ENOENT;
        return -1;
    }
    if (write_args(dir, argv, argfile, sizeof(argfile)) != 0) {
        fprintf(stderr, "xide: cannot write args errno %d\n", errno);
        return -1;
    }
    linker = linker_for(cls);
    ev = env_set(envp ? envp : environ, "XIDE_ARGFILE", argfile);
    if (!ev) return -1;
    ev = env_set(ev, "XIDE_ARGV0", path);
    ev = env_set(ev, "XIDE_EXE", path);
    if (is_java_bin(path)) {
        const char* launch = getenv("XIDE_LAUNCH");
        if (launch && launch[0] == '/') path = launch;
        ev = env_set(ev, "XIDE_INJECT_ARGV", "0");
    } else {
        ev = env_set(ev, "XIDE_INJECT_ARGV", "1");
    }
    av[0] = (char*)linker;
    av[1] = (char*)path;
    av[2] = NULL;
    if (!real_execve) real_execve = dlsym(RTLD_NEXT, "execve");
    real_execve(linker, av, ev);
    fprintf(stderr, "xide: linker errno %d (%s)\n", errno, strerror(errno));
    return -1;
}

int execve(const char* path, char* const argv[], char* const envp[]) {
    int cls;
    if (!real_execve) real_execve = dlsym(RTLD_NEXT, "execve");
    if (!should_wrap(path)) return real_execve(path, argv, envp);
    cls = elf_class(path);
    if (cls == 0) {
        exec_script(path, argv, envp ? envp : environ);
        return -1;
    }
    exec_via_linker(path, argv, envp);
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

#ifndef XIDE_RUNNER
static char** read_arg_file(const char* path, const char* arg0, int* argc_out) {
    int fd = open(path, O_RDONLY | O_CLOEXEC);
    off_t sz;
    char* buf;
    int nuls = 0;
    int i;
    int n = 1;
    char* p;
    char** av;
    if (fd < 0) return NULL;
    sz = lseek(fd, 0, SEEK_END);
    if (sz < 0 || sz > 1024 * 1024) {
        close(fd);
        return NULL;
    }
    if (lseek(fd, 0, SEEK_SET) < 0) {
        close(fd);
        return NULL;
    }
    buf = (char*)malloc((size_t)sz + 1);
    if (!buf || (sz > 0 && read(fd, buf, (size_t)sz) != sz)) {
        close(fd);
        free(buf);
        return NULL;
    }
    close(fd);
    buf[sz] = 0;
    for (i = 0; i < sz; i++) if (buf[i] == 0) nuls++;
    av = (char**)calloc((size_t)nuls + 2, sizeof(char*));
    if (!av) return NULL;
    av[0] = strdup(arg0);
    p = buf;
    for (i = 0; i < nuls; i++) {
        av[n++] = p;
        p += strlen(p) + 1;
    }
    av[n] = NULL;
    *argc_out = n;
    return av;
}

static int (*xide_saved_main)(int, char**, char**);

static int same_exe(const char* a, const char* b) {
    char ra[PATH_MAX];
    char rb[PATH_MAX];
    if (!a || !b) return 0;
    if (strcmp(a, b) == 0) return 1;
    if (!realpath(a, ra) || !realpath(b, rb)) return 0;
    return strcmp(ra, rb) == 0;
}

static int xide_slingshot(int argc, char** argv, char** envp) {
    const char* file = getenv("XIDE_ARGFILE");
    const char* arg0 = getenv("XIDE_ARGV0");
    const char* inject = getenv("XIDE_INJECT_ARGV");
    char** nav;
    int nac = 0;
    if (inject && inject[0] == '1' && file && arg0 && argv && argv[0] && same_exe(argv[0], arg0)) {
        nav = read_arg_file(file, arg0, &nac);
        if (nav && nac >= 1) {
            argc = nac;
            argv = nav;
        } else {
            fprintf(stderr, "xide: argfile unread\n");
        }
    }
    return xide_saved_main(argc, argv, envp);
}

/* The dynamic linker resolves the executable's __libc_init to this preload.
   Real libc still applies the linker64 argument shift, then we restore flags. */
void __libc_init(void* raw_args, void (*onexit)(void), int (*slingshot)(int, char**, char**), const void* structors) {
    void (*real_init)(void*, void (*)(void), int (*)(int, char**, char**), const void*);
    const char* inject;
    real_init = dlsym(RTLD_NEXT, "__libc_init");
    if (!real_init || !slingshot) {
        fprintf(stderr, "xide: __libc_init missing\n");
        _exit(127);
    }
    inject = getenv("XIDE_INJECT_ARGV");
    if (inject && inject[0] == '1') {
        xide_saved_main = slingshot;
        real_init(raw_args, onexit, xide_slingshot, structors);
    } else {
        real_init(raw_args, onexit, slingshot, structors);
    }
}
#endif

__attribute__((constructor(101))) static void xide_untag(void) {
    /* Android 11+ tags heap pointers. This JDK clears the tag and free() aborts (exit 134). */
    unsigned level = 0;
    int (*am)(int, void*, size_t);
    void* p;
    am = (int (*)(int, void*, size_t))dlsym(RTLD_DEFAULT, "android_mallopt");
    if (am) am(8 /* M_SET_HEAP_TAGGING_LEVEL */, &level, sizeof(level));
    mallopt(M_BIONIC_SET_HEAP_TAGGING_LEVEL, M_HEAP_TAGGING_LEVEL_NONE);
    p = malloc(16);
    if (p && (((uintptr_t)p) >> 56) != 0) {
        fprintf(stderr, "xide: heap tag still set\n");
    }
    free(p);
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
static int try_dlmain(const char* path, int argc, char** argv) {
    void* handle;
    int (*fn)(int, char**);
    const char* err;
    dlerror();
    handle = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
    if (!handle) {
        err = dlerror();
        fprintf(stderr, "xide-run: dlopen %s: %s\n", path, err ? err : "failed");
        return -1;
    }
    fn = (int (*)(int, char**))dlsym(handle, "main");
    if (!fn) {
        err = dlerror();
        fprintf(stderr, "xide-run: %s has no exported main (%s)\n", path, err ? err : "missing");
        return -1;
    }
    return fn(argc, argv);
}

int main(int argc, char** argv) {
    if (argc < 2 || !argv[1] || argv[1][0] != '/') {
        fprintf(stderr, "xide-run: need an absolute program path\n");
        return 2;
    }
    if (is_java_bin(argv[1])) {
        exec_via_linker(argv[1], argv + 1, environ);
        return 127;
    }
    if (try_dlmain(argv[1], argc - 1, argv + 1) == 0) return 0;
    exec_private(argv[1], argv + 1, environ);
    fprintf(stderr, "xide-run: cannot start %s: %s\n", argv[1], strerror(errno));
    return 127;
}
#endif
