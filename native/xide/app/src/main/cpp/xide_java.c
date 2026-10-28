/* Loaded by /system/bin/linker64 with only an absolute path.
   This phone rejects linker arguments that are not absolute paths, and it
   also rejects memfd exec. Arguments are read from XIDE_ARGFILE. libjli.so
   is a DT_NEEDED dependency found via $ORIGIN/../lib when this file sits in
   jdk/bin. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>

extern int JLI_Launch(int argc, char** argv,
                      int jargc, const char** jargv,
                      int appclassc, const char** appclassv,
                      const char* fullversion,
                      const char* dotversion,
                      const char* pname,
                      const char* lname,
                      int javaargs,
                      int cpwildcard,
                      int javaw,
                      int ergo);

static char** read_args(const char* path, const char* arg0, int* argc_out) {
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
    if (!buf || read(fd, buf, (size_t)sz) != sz) {
        close(fd);
        free(buf);
        return NULL;
    }
    close(fd);
    buf[sz] = 0;
    for (i = 0; i < sz; i++) if (buf[i] == 0) nuls++;
    av = (char**)calloc((size_t)nuls + 2, sizeof(char*));
    if (!av) return NULL;
    av[0] = strdup(arg0 ? arg0 : "java");
    p = buf;
    for (i = 0; i < nuls; i++) {
        av[n++] = p;
        p += strlen(p) + 1;
    }
    av[n] = NULL;
    *argc_out = n;
    return av;
}

int main(void) {
    const char* arg0 = getenv("XIDE_ARGV0");
    const char* file = getenv("XIDE_ARGFILE");
    char** argv;
    int argc = 0;
    int rc;
    if (!arg0 || arg0[0] != '/') arg0 = "java";
    if (!file || file[0] != '/') {
        fprintf(stderr, "xide-java: XIDE_ARGFILE missing\n");
        return 2;
    }
    argv = read_args(file, arg0, &argc);
    if (!argv || argc < 1) {
        fprintf(stderr, "xide-java: cannot read %s\n", file);
        return 2;
    }
    rc = JLI_Launch(argc, argv, 0, NULL, 0, NULL,
                    "11.0.1", "11", arg0, "java",
                    0, 1, 0, 0);
    return rc;
}
