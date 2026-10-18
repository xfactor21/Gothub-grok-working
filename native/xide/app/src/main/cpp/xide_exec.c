/* Interpose exec so Gradle can launch aapt2/java from app storage.
   Android 10+ denies direct exec of app-private files (EACCES / error 13).
   Rewriting the call to /system/bin/linker64 is allowed. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <spawn.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern char** environ;

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

static const char* linker_for(int cls) {
    if (cls == 32 && access("/system/bin/linker", X_OK) == 0) return "/system/bin/linker";
    return "/system/bin/linker64";
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
    return strncmp(path, "/data/", 6) == 0 || strncmp(path, "/mnt/", 5) == 0;
}

static char** wrap_argv(const char* path, char* const argv[], const char** out_bin) {
    int argc = 0;
    int i;
    char** na;
    int cls = elf_class(path);
    while (argv && argv[argc]) argc++;
    na = (char**)malloc((size_t)(argc + 3) * sizeof(char*));
    if (!na) return NULL;
    if (cls == 0) {
        *out_bin = "/system/bin/sh";
        na[0] = (char*)"/system/bin/sh";
        na[1] = (char*)path;
        for (i = 1; i < argc; i++) na[i + 1] = argv[i];
        na[argc + 1] = NULL;
    } else {
        *out_bin = linker_for(cls);
        na[0] = (char*)*out_bin;
        na[1] = (char*)path;
        for (i = 1; i < argc; i++) na[i + 1] = argv[i];
        na[argc + 1] = NULL;
    }
    return na;
}

static int (*real_execve)(const char*, char* const[], char* const[]);

int execve(const char* path, char* const argv[], char* const envp[]) {
    const char* bin = NULL;
    char** na;
    int rc;
    if (!real_execve) real_execve = dlsym(RTLD_NEXT, "execve");
    if (!should_wrap(path)) return real_execve(path, argv, envp);
    na = wrap_argv(path, argv, &bin);
    if (!na) return real_execve(path, argv, envp);
    rc = real_execve(bin, na, envp);
    free(na);
    return rc;
}

int execv(const char* path, char* const argv[]) {
    return execve(path, argv, environ);
}

static int (*real_execvp)(const char*, char* const[]);

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
    char* full;
    int rc;
    if (!real_execvp) real_execvp = dlsym(RTLD_NEXT, "execvp");
    full = resolve_path(file);
    if (full && should_wrap(full)) {
        rc = execve(full, argv, environ);
        free(full);
        return rc;
    }
    free(full);
    return real_execvp(file, argv);
}

static int (*real_posix_spawn)(pid_t*, const char*, const posix_spawn_file_actions_t*,
                               const posix_spawnattr_t*, char* const[], char* const[]);

int posix_spawn(pid_t* pid, const char* path, const posix_spawn_file_actions_t* actions,
                 const posix_spawnattr_t* attr, char* const argv[], char* const envp[]) {
    const char* bin = NULL;
    char** na;
    int rc;
    if (!real_posix_spawn) real_posix_spawn = dlsym(RTLD_NEXT, "posix_spawn");
    if (!should_wrap(path)) return real_posix_spawn(pid, path, actions, attr, argv, envp);
    na = wrap_argv(path, argv, &bin);
    if (!na) return real_posix_spawn(pid, path, actions, attr, argv, envp);
    rc = real_posix_spawn(pid, bin, actions, attr, na, envp);
    free(na);
    return rc;
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
