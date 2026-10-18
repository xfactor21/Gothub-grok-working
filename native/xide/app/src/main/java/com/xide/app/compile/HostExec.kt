package com.xide.app.compile

import android.content.Context
import com.xide.app.toolchain.Archives
import com.xide.app.toolchain.LogBus
import com.xide.app.toolchain.Toolchain
import java.io.File

/** Android 10+ refuses execve() on files the app wrote (EACCES, error 13), even in filesDir.
 *  The dynamic linker in /system is allowed to map those ELFs, so every private binary
 *  is started as `linker64 <binary> <args>`. Child processes get the same rewrite from
 *  libxide-exec.so via LD_PRELOAD. */
object HostExec {
    fun elfClass(file: File): Int {
        return try {
            file.inputStream().use { input ->
                val b = ByteArray(5)
                if (input.read(b) < 5) return 0
                if (b[0] != 0x7f.toByte() || b[1] != 'E'.code.toByte() || b[2] != 'L'.code.toByte() || b[3] != 'F'.code.toByte()) {
                    return 0
                }
                if (b[4].toInt() == 2) 64 else 32
            }
        } catch (_: Throwable) {
            0
        }
    }

    fun command(binary: File, args: List<String>): List<String> {
        binary.setExecutable(true, false)
        val cls = elfClass(binary)
        if (cls == 0) return listOf("/system/bin/sh", binary.absolutePath) + args
        val linker = if (cls == 64) "/system/bin/linker64" else "/system/bin/linker"
        if (!File(linker).exists()) return listOf(binary.absolutePath) + args
        return listOf(linker, binary.absolutePath) + args
    }

    fun preload(ctx: Context): String? {
        val dir = ctx.applicationInfo.nativeLibraryDir ?: return null
        val lib = File(dir, "libxide-exec.so")
        return if (lib.exists()) lib.absolutePath else null
    }

    fun fillEnv(ctx: Context, env: MutableMap<String, String>, javaHome: File, sdk: File) {
        val tmp = File(ctx.cacheDir, "compile").also { it.mkdirs() }
        val libDir = File(javaHome, "lib")
        val serverDir = File(javaHome, "lib/server")
        val jli = File(javaHome, "lib/jli")
        val ld = listOf(serverDir, jli, libDir).filter { it.exists() }.joinToString(":")
        env["JAVA_HOME"] = javaHome.absolutePath
        env["ANDROID_HOME"] = sdk.absolutePath
        env["ANDROID_SDK_ROOT"] = sdk.absolutePath
        env["GRADLE_USER_HOME"] = Toolchain.gradleUser(ctx).also { it.mkdirs() }.absolutePath
        env["HOME"] = ctx.filesDir.absolutePath
        env["TMPDIR"] = tmp.absolutePath
        env["LANG"] = "C.UTF-8"
        if (ld.isNotBlank()) {
            val prev = env["LD_LIBRARY_PATH"]
            env["LD_LIBRARY_PATH"] = if (prev.isNullOrBlank()) ld else "$ld:$prev"
        }
        val javaBin = File(javaHome, "bin")
        val bt = File(sdk, "build-tools").listFiles()?.maxByOrNull { it.name }
        val path = env["PATH"] ?: "/system/bin:/system/xbin"
        env["PATH"] = listOfNotNull(javaBin.absolutePath, bt?.absolutePath, path).joinToString(":")
        val pre = preload(ctx)
        if (pre != null) {
            val prev = env["LD_PRELOAD"]
            env["LD_PRELOAD"] = if (prev.isNullOrBlank()) pre else "$pre:$prev"
        }
    }

    /** Run a private ELF (java, aapt2) and return combined output. Throws on non-zero. */
    fun runCaptured(binary: File, args: List<String>, env: Map<String, String>, dir: File, mark: File?): String {
        val cmd = command(binary, args)
        val pb = ProcessBuilder(cmd).directory(dir).redirectErrorStream(true)
        val e = pb.environment()
        env.forEach { (k, v) -> e[k] = v }
        if (mark != null) e["XIDE_SHIM_MARK"] = mark.absolutePath
        LogBus.add(cmd.joinToString(" "))
        val proc = pb.start()
        val text = proc.inputStream.bufferedReader().use { it.readText() }
        val code = proc.waitFor()
        if (code != 0) {
            error(text.lineSequence().map { it.trim() }.lastOrNull { it.isNotBlank() } ?: "exit $code")
        }
        return text
    }

    fun prepareBins(ctx: Context) {
        Archives.chmodTree(Toolchain.jdkHome(ctx))
        Archives.chmodTree(Toolchain.sdkHome(ctx))
        Archives.chmodTree(Toolchain.gradleHome(ctx))
    }
}
