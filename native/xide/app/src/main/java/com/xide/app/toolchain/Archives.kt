package com.xide.app.toolchain

import android.system.Os
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream
import org.tukaani.xz.XZInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object Archives {
    fun extractTarXz(src: File, dest: File) {
        dest.mkdirs()
        val root = dest.canonicalFile
        FileInputStream(src).use { fi ->
            BufferedInputStream(fi, 64 * 1024).use { bi ->
                XZInputStream(bi).use { xz ->
                    TarArchiveInputStream(xz).use { tar ->
                        var entry = tar.nextEntry
                        while (entry != null) {
                            val out = File(dest, entry.name).canonicalFile
                            require(out.path.startsWith(root.path + File.separator) || out.path == root.path) {
                                "bad path ${entry.name}"
                            }
                            if (entry.isDirectory) {
                                out.mkdirs()
                            } else {
                                out.parentFile?.mkdirs()
                                FileOutputStream(out).use { tar.copyTo(it) }
                                val mode = entry.mode and 0b111111111
                                if (mode and 0b001001001 != 0) {
                                    chmod(out, mode)
                                }
                            }
                            entry = tar.nextEntry
                        }
                    }
                }
            }
        }
    }

    fun extractZip(src: File, dest: File) {
        dest.mkdirs()
        val root = dest.canonicalFile
        FileInputStream(src).use { fi ->
            BufferedInputStream(fi, 64 * 1024).use { bi ->
                ZipArchiveInputStream(bi).use { zip ->
                    var entry = zip.nextEntry
                    while (entry != null) {
                        val out = File(dest, entry.name).canonicalFile
                        require(out.path.startsWith(root.path + File.separator) || out.path == root.path) {
                            "bad path ${entry.name}"
                        }
                        if (entry.isDirectory) {
                            out.mkdirs()
                        } else {
                            out.parentFile?.mkdirs()
                            FileOutputStream(out).use { zip.copyTo(it) }
                            if (entry.unixMode and 0b001001001 != 0) {
                                chmod(out, entry.unixMode and 0b111111111)
                            }
                        }
                        entry = zip.nextEntry
                    }
                }
            }
        }
    }

    fun chmodTree(dir: File) {
        if (!dir.exists()) return
        dir.walkTopDown().forEach { f ->
            if (f.isFile) {
                val n = f.name
                val exec = n in EXEC_NAMES ||
                    n.endsWith(".so") ||
                    (!n.contains('.') && f.length() > 32)
                if (exec) chmod(f, 0b111101101) // 0755
            }
        }
    }

    private fun chmod(file: File, mode: Int) {
        try {
            Os.chmod(file.absolutePath, mode)
        } catch (_: Throwable) {
            file.setExecutable(true, false)
        }
    }

    private val EXEC_NAMES = setOf(
        "java", "javac", "jar", "jdb", "keytool", "aapt", "aapt2", "d8", "zipalign",
        "apksigner", "aidl", "dexdump", "split-select", "adb", "fastboot", "gradle",
        "profgen", "llvm-rs-cc",
    )
}
