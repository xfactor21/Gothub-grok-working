package com.xide.app.compile

import android.content.Context
import com.xide.app.XideApp
import com.xide.app.toolchain.LogBus
import com.xide.app.toolchain.Toolchain
import java.io.File
import java.util.concurrent.TimeUnit

object Shell {
    fun run(ctx: Context, projectId: String?, line: String) {
        val repo = (ctx.applicationContext as XideApp).projects
        val dir = if (projectId != null && repo.get(projectId) != null) repo.dir(projectId) else ctx.filesDir
        val tc = Toolchain.probe(ctx)
        LogBus.add("$ $line")
        val pb = ProcessBuilder(listOf("/system/bin/sh", "-c", line))
            .directory(dir)
            .redirectErrorStream(true)
        val env = pb.environment()
        val javaHome = tc.jdkHome?.let { File(it) }
        val sdk = Toolchain.sdkHome(ctx)
        if (javaHome != null && javaHome.exists()) HostExec.fillEnv(ctx, env, javaHome, sdk)
        else HostExec.preload(ctx)?.let { env["LD_PRELOAD"] = it }
        val proc = pb.start()
        val reader = Thread {
            proc.inputStream.bufferedReader().use { r ->
                while (true) {
                    val row = r.readLine() ?: break
                    if (row.isNotBlank()) LogBus.add(row.take(400))
                }
            }
        }
        reader.isDaemon = true
        reader.start()
        if (!proc.waitFor(3, TimeUnit.MINUTES)) {
            proc.destroyForcibly()
            LogBus.add("stopped after 3 minutes")
        } else if (proc.exitValue() != 0) {
            LogBus.add("exit ${proc.exitValue()}")
        }
        reader.join(1500)
    }
}
