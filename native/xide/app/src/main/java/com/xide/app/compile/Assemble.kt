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
        HostExec.prepareBins(ctx)
        val sdk = File(tc.sdkHome!!)
        File(dir, "local.properties").writeText("sdk.dir=${sdk.absolutePath.replace("\\", "\\\\")}\n")

        val launcher = File(tc.gradleLauncher!!)
        val env = mutableMapOf<String, String>()
        HostExec.fillEnv(ctx, env, javaHome, sdk)
        val mark = File(ctx.cacheDir, "shim-mark.txt")
        mark.delete()
        env["XIDE_SHIM_MARK"] = mark.absolutePath

        LogBus.job("running", "Assemble ${project.name}", "Checking java — heap tags off")
        try {
            val verCmd = HostExec.armJava(ctx, javaHome, javaBin, listOf("-version"), env)
            val ver = HostExec.runCommand(verCmd, env, dir)
            ver.lineSequence().map { it.trim() }.firstOrNull { it.isNotBlank() }?.let { LogBus.add(it.take(400)) }
            if (mark.exists()) LogBus.add("exec shim loaded — child tools can start")
            else LogBus.add("exec shim did not load — aapt2 may still be blocked")
        } catch (t: Throwable) {
            LogBus.job(
                "failed",
                "Assemble failed",
                "Cannot start java (${t.message ?: "error"}). Files are installed; Android refused to run them.",
            )
            return
        }

        val aapt = Toolchain.findAapt2(sdk)
        if (aapt != null) {
            try {
                val aaptCmd = HostExec.armTool(aapt, listOf("version"), env)
                HostExec.runCommand(aaptCmd, env, dir)
                    .lineSequence().map { it.trim() }.firstOrNull { it.isNotBlank() }
                    ?.let { LogBus.add("aapt2 $it".take(400)) }
            } catch (t: Throwable) {
                LogBus.add("aapt2 check failed: ${t.message?.take(300)}")
            }
        }

        LogBus.add("Gradle assembleDebug — first run needs Wi-Fi")
        val cmd = HostExec.armJava(
            ctx,
            javaHome,
            javaBin,
            listOf(
                "-Xmx768m",
                "-Dfile.encoding=UTF-8",
                "-Djava.io.tmpdir=${env["TMPDIR"]}",
                "-Dorg.gradle.appname=gradle",
                "-Dkotlin.compiler.execution.strategy=in-process",
                "-classpath",
                launcher.absolutePath,
                "org.gradle.launcher.GradleMain",
                "--no-daemon",
                "--warning-mode", "none",
                ":app:assembleDebug",
            ),
            env,
        )

        val pb = ProcessBuilder(cmd)
            .directory(dir)
            .redirectErrorStream(true)
        val penv = pb.environment()
        env.forEach { (k, v) -> penv[k] = v }

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
