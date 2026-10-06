package com.xide.app.toolchain

import android.content.Context
import android.os.Build
import android.os.StatFs
import com.xide.app.data.ToolchainStatus
import java.io.File

object Toolchain {
    fun root(ctx: Context): File {
        // Internal storage: emulated/sdcard is often noexec, so java/aapt2 would not run.
        return File(ctx.filesDir, "toolchain").also { it.mkdirs() }
    }

    fun sdkHome(ctx: Context) = File(root(ctx), "android-sdk")
    fun jdkHome(ctx: Context) = File(root(ctx), "jdk")
    fun gradleHome(ctx: Context) = File(root(ctx), "gradle")
    fun gradleUser(ctx: Context) = File(root(ctx), "gradle-home")

    fun abi(): String {
        val abis = Build.SUPPORTED_ABIS ?: emptyArray()
        return when {
            abis.any { it == "arm64-v8a" } -> "aarch64"
            abis.any { it == "armeabi-v7a" || it == "armeabi" } -> "arm"
            abis.any { it == "x86_64" } -> "x86_64"
            else -> abis.firstOrNull() ?: "unknown"
        }
    }

    fun findJava(home: File): File? {
        val direct = File(home, "bin/java")
        if (direct.exists()) return home
        home.walkTopDown().maxDepth(4).forEach { f ->
            if (f.isFile && f.name == "java" && f.parentFile?.name == "bin") {
                return f.parentFile.parentFile
            }
        }
        return if (home.exists()) {
            home.listFiles()?.firstOrNull { findJava(it) != null }?.let { findJava(it) }
        } else null
    }

    fun findLauncher(gradleRoot: File): File? {
        if (!gradleRoot.exists()) return null
        return gradleRoot.walkTopDown().maxDepth(6).firstOrNull {
            it.isFile && it.name.startsWith("gradle-launcher") && it.name.endsWith(".jar")
        }
    }

    fun findAapt2(sdk: File): File? {
        val bt = File(sdk, "build-tools")
        if (!bt.exists()) return null
        return bt.walkTopDown().maxDepth(3).firstOrNull { it.isFile && it.name == "aapt2" }
    }

    fun findAndroidJar(sdk: File): File? {
        val plat = File(sdk, "platforms")
        if (!plat.exists()) return null
        return plat.walkTopDown().maxDepth(3).firstOrNull { it.isFile && it.name == "android.jar" }
    }

    fun probe(ctx: Context): ToolchainStatus {
        val abi = abi()
        val jdk = findJava(jdkHome(ctx))
        val launcher = findLauncher(gradleHome(ctx))
        val aapt = findAapt2(sdkHome(ctx))
        val jar = findAndroidJar(sdkHome(ctx))
        val labels = buildList {
            if (jdk != null) add("JDK 11")
            if (launcher != null) add("Gradle 7.6.4")
            if (aapt != null) add("build-tools")
            if (jar != null) add("android.jar")
        }
        val blocked = when (abi) {
            "x86_64" ->
                "This CPU (x86_64) has no on-device JDK package. Phones are ARM64 — install xIDE there."
            "unknown" -> "Unknown CPU. Need ARM64."
            else -> null
        }
        return ToolchainStatus(
            jdk = jdk != null,
            gradle = launcher != null,
            aapt2 = aapt != null,
            androidJar = jar != null,
            abi = abi,
            jdkHome = jdk?.absolutePath,
            gradleLauncher = launcher?.absolutePath,
            sdkHome = sdkHome(ctx).absolutePath,
            labels = labels,
            blocked = if (jdk == null) blocked else null,
        )
    }

    fun freeBytes(ctx: Context): Long {
        return try {
            StatFs(root(ctx).absolutePath).availableBytes
        } catch (_: Throwable) {
            0L
        }
    }
}
