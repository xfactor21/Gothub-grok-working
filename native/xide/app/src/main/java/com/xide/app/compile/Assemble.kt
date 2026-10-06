package com.xide.app.compile

import android.content.Context
import com.xide.app.toolchain.LogBus
import com.xide.app.toolchain.Toolchain
import java.io.File
import java.io.InputStream
import java.util.concurrent.TimeUnit

object Assemble {
    fun run(ctx: Context, projectId: String) {
        val repo = (ctx.applicationContext as com.xide.app.XideApp).projects
        val project = repo.get(projectId) ?: error("Project not found")
        val dir = repo.dir(projectId)
        val tc = Toolchain.probe(ctx)
        if (!tc.ready) {
            val why = tc.blocked ?: "SDK not ready. Open Settings and tap Download SDK."
            LogBus.job("failed", "Assemble blocked", why)
            return
        }
        val javaHome = File(tc.jdkHome!!)
        val javaBin = File(javaHome, "bin/java")
        if (!javaBin.exists()) {
            LogBus.job("failed", "Assemble blocked", "java missing at ${javaBin.path}")
            return
        }
        javaBin.setExecutable(true, false)
        val sdk = File(tc.sdkHome!!)
        File(dir, "local.properties").writeText("sdk.dir=${sdk.absolutePath.replace("\\", "\\\\")}\n")

        val launcher = File(tc.gradleLauncher!!)
        LogBus.job("running", "Assemble ${project.name}", "Gradle assembleDebug — first run needs Wi-Fi")

        val gradleUser = Toolchain.gradleUser(ctx).also { it.mkdirs() }
        val tmp = File(ctx.cacheDir, "compile").also { it.mkdirs() }
        val libDir = File(javaHome, "lib")
        val serverDir = File(javaHome, "lib/server")
        val jli = File(javaHome, "lib/jli")
        val ld = listOf(serverDir, jli, libDir)
            .filter { it.exists() }
            .joinToString(":")

        val cmd = listOf(
            javaBin.absolutePath,
            "-Xmx768m",
            "-Dfile.encoding=UTF-8",
            "-Djava.io.tmpdir=${tmp.absolutePath}",
            "-Dorg.gradle.appname=gradle",
            "-Dkotlin.compiler.execution.strategy=in-process",
            "-classpath",
            launcher.absolutePath,
            "org.gradle.launcher.GradleMain",
            "--no-daemon",
            "--warning-mode", "none",
            ":app:assembleDebug",
        )

        val pb = ProcessBuilder(cmd)
            .directory(dir)
            .redirectErrorStream(true)
        val env = pb.environment()
        env["JAVA_HOME"] = javaHome.absolutePath
        env["ANDROID_HOME"] = sdk.absolutePath
        env["ANDROID_SDK_ROOT"] = sdk.absolutePath
        env["GRADLE_USER_HOME"] = gradleUser.absolutePath
        env["HOME"] = ctx.filesDir.absolutePath
        env["TMPDIR"] = tmp.absolutePath
        env["LANG"] = "C.UTF-8"
        env["LD_LIBRARY_PATH"] = if (ld.isBlank()) env["LD_LIBRARY_PATH"] ?: "" else {
            val prev = env["LD_LIBRARY_PATH"]
            if (prev.isNullOrBlank()) ld else "$ld:$prev"
        }
        val path = env["PATH"] ?: "/system/bin:/system/xbin"
        env["PATH"] = "${javaBin.parent}:${File(sdk, "build-tools/34.0.4").absolutePath}:$path"

        val proc = pb.start()
        val gobble = Thread { drain(proc.inputStream) }
        gobble.isDaemon = true
        gobble.start()
        val finished = proc.waitFor(25, TimeUnit.MINUTES)
        if (!finished) {
            proc.destroyForcibly()
            LogBus.job("failed", "Assemble timed out", "Stopped after 25 minutes")
            return
        }
        gobble.join(2000)
        val code = proc.exitValue()
        val apk = findApk(dir)
        if (code == 0 && apk != null) {
            val dest = File(ctx.getExternalFilesDir("apk") ?: ctx.filesDir, apk.name)
            dest.parentFile?.mkdirs()
            apk.copyTo(dest, overwrite = true)
            LogBus.job("success", "APK ready", "assembleDebug ok · ${dest.name}", dest.absolutePath)
        } else {
            LogBus.job(
                "failed",
                "Assemble failed",
                if (apk == null) "Gradle exit $code — no APK" else "Gradle exit $code",
            )
        }
    }

    private fun drain(stream: InputStream) {
        stream.bufferedReader().use { r ->
            while (true) {
                val line = r.readLine() ?: break
                val t = line.trimEnd()
                if (t.isNotBlank()) LogBus.add(t.take(400))
            }
        }
    }

    private fun findApk(projectDir: File): File? {
        val out = File(projectDir, "app/build/outputs/apk")
        if (!out.exists()) return null
        return out.walkTopDown().filter { it.isFile && it.name.endsWith(".apk") }.maxByOrNull { it.lastModified() }
    }
}
