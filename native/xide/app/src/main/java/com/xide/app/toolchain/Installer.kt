package com.xide.app.toolchain

import android.content.Context
import java.io.File

object Installer {
    private const val JDK_A64 =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/jdk-11/jdk11-aarch64.tar.xz"
    private const val JDK_ARM =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/jdk-11/jdk11-aarch32.tar.xz"
    private const val SDK =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/sdk/android-sdk.tar.xz"
    private const val BT_A64 =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/build-tools-34.0.4-aarch64.tar.xz"
    private const val BT_ARM =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/build-tools-34.0.4-arm.tar.xz"
    private const val BT_X64 =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/build-tools-34.0.4-x86_64.tar.xz"
    private const val PT_A64 =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/platform-tools-34.0.4-aarch64.tar.xz"
    private const val PT_ARM =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/platform-tools-34.0.4-arm.tar.xz"
    private const val PT_X64 =
        "https://github.com/AndroidIDEOfficial/androidide-tools/releases/download/v34.0.4/platform-tools-34.0.4-x86_64.tar.xz"
    private const val PLATFORM =
        "https://dl.google.com/android/repository/platform-33_r02.zip"
    private const val GRADLE =
        "https://services.gradle.org/distributions/gradle-7.6.4-bin.zip"

    fun install(ctx: Context) {
        val abi = Toolchain.abi()
        LogBus.job("running", "Download SDK", "CPU $abi")
        val free = Toolchain.freeBytes(ctx)
        if (free in 1 until 3L * 1024 * 1024 * 1024) {
            LogBus.add("Warning: about ${free / (1024 * 1024)} MB free. Need ~3 GB.")
        }
        val root = Toolchain.root(ctx)
        val cache = File(root, "cache").also { it.mkdirs() }

        when (abi) {
            "aarch64", "arm" -> {
                fetchExtract(
                    ctx, cache, "jdk.tar.xz",
                    if (abi == "aarch64") JDK_A64 else JDK_ARM,
                    Toolchain.jdkHome(ctx), tarxz = true, skipIf = { Toolchain.findJava(it) != null },
                    "JDK 11",
                )
            }
            else -> LogBus.add("No JDK tarball for $abi — Kotlin assemble needs ARM64.")
        }

        fetchExtract(ctx, cache, "android-sdk.tar.xz", SDK, Toolchain.sdkHome(ctx), tarxz = true, skipIf = {
            it.exists() && (it.list()?.isNotEmpty() == true)
        }, "Android SDK layout")

        val btUrl = when (abi) {
            "aarch64" -> BT_A64
            "arm" -> BT_ARM
            "x86_64" -> BT_X64
            else -> null
        }
        if (btUrl != null) {
            val tmp = File(cache, "build-tools-extract")
            fetchExtract(ctx, cache, "build-tools.tar.xz", btUrl, tmp, tarxz = true, skipIf = {
                Toolchain.findAapt2(Toolchain.sdkHome(ctx)) != null
            }, "build-tools 34.0.4")
            placeNamed(tmp, File(Toolchain.sdkHome(ctx), "build-tools/34.0.4"), "aapt2")
        }

        val ptUrl = when (abi) {
            "aarch64" -> PT_A64
            "arm" -> PT_ARM
            "x86_64" -> PT_X64
            else -> null
        }
        if (ptUrl != null) {
            fetchExtract(
                ctx, cache, "platform-tools.tar.xz", ptUrl,
                File(Toolchain.sdkHome(ctx), "platform-tools"),
                tarxz = true,
                skipIf = { File(it, "adb").exists() || File(it, "adb.exe").exists() },
                "platform-tools",
            )
        }

        fetchExtract(
            ctx, cache, "platform-33.zip", PLATFORM,
            File(cache, "platform-33"),
            tarxz = false,
            skipIf = { Toolchain.findAndroidJar(Toolchain.sdkHome(ctx)) != null },
            "android-33 platform",
        )
        placeNamed(File(cache, "platform-33"), File(Toolchain.sdkHome(ctx), "platforms/android-33"), "android.jar")

        fetchExtract(
            ctx, cache, "gradle-7.6.4-bin.zip", GRADLE,
            Toolchain.gradleHome(ctx),
            tarxz = false,
            skipIf = { Toolchain.findLauncher(it) != null },
            "Gradle 7.6.4",
        )

        Archives.chmodTree(Toolchain.jdkHome(ctx))
        Archives.chmodTree(Toolchain.sdkHome(ctx))
        Archives.chmodTree(Toolchain.gradleHome(ctx))

        val status = Toolchain.probe(ctx)
        if (status.ready) {
            LogBus.job("success", "SDK ready", "Ready · ${status.labels.joinToString(" · ")}")
        } else {
            val missing = buildList {
                if (!status.jdk) add("JDK")
                if (!status.gradle) add("Gradle")
                if (!status.aapt2) add("aapt2")
                if (!status.androidJar) add("android.jar")
            }
            LogBus.job("failed", "SDK incomplete", status.blocked ?: "Missing: ${missing.joinToString(" · ")}")
        }
    }

    private fun fetchExtract(
        ctx: Context,
        cache: File,
        fileName: String,
        url: String,
        dest: File,
        tarxz: Boolean,
        skipIf: (File) -> Boolean,
        label: String,
    ) {
        if (skipIf(dest)) {
            LogBus.add("$label already present")
            return
        }
        LogBus.add("Downloading $label")
        val archive = File(cache, fileName)
        if (!archive.exists() || archive.length() < 1024) {
            Downloads.get(url, archive) { LogBus.add(it) }
        } else {
            LogBus.add("Using cached $fileName")
        }
        dest.mkdirs()
        LogBus.add("Extracting $label")
        if (tarxz) Archives.extractTarXz(archive, dest) else Archives.extractZip(archive, dest)
        Archives.chmodTree(dest)
        LogBus.add("Installed $label")
    }

    private fun placeNamed(from: File, to: File, marker: String) {
        if (File(to, marker).exists()) return
        if (!from.exists()) return
        val found = from.walkTopDown().firstOrNull { it.isFile && it.name == marker } ?: return
        val parent = found.parentFile ?: return
        to.parentFile?.mkdirs()
        if (to.exists()) return
        if (!parent.renameTo(to)) {
            parent.copyRecursively(to, overwrite = true)
        }
    }
}
