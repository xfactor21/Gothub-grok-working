package com.xide.app.toolchain

import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object Downloads {
    fun get(url: String, dest: File, log: (String) -> Unit) {
        dest.parentFile?.mkdirs()
        val tmp = File(dest.parentFile, dest.name + ".part")
        if (tmp.exists()) tmp.delete()
        var current = url
        repeat(8) {
            val conn = (URL(current).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                setRequestProperty("User-Agent", "xIDE/9")
                connectTimeout = 30_000
                readTimeout = 60_000
            }
            val code = conn.responseCode
            if (code in 300..399) {
                val next = conn.getHeaderField("Location") ?: error("redirect without location")
                conn.disconnect()
                current = if (next.startsWith("http")) next else URL(URL(current), next).toString()
                return@repeat
            }
            if (code !in 200..299) {
                conn.disconnect()
                error("download failed $code for $url")
            }
            val total = conn.contentLengthLong
            var read = 0L
            var lastPct = -1
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        out.write(buf, 0, n)
                        read += n
                        if (total > 0) {
                            val pct = ((read * 100) / total).toInt()
                            if (pct != lastPct && pct % 5 == 0) {
                                lastPct = pct
                                log("${dest.name}  $pct%")
                            }
                        }
                    }
                }
            }
            conn.disconnect()
            if (dest.exists()) dest.delete()
            if (!tmp.renameTo(dest)) {
                tmp.copyTo(dest, overwrite = true)
                tmp.delete()
            }
            log("saved ${dest.name} (${mb(read)})")
            return
        }
        error("too many redirects for $url")
    }

    fun mb(n: Long): String {
        if (n < 1024) return "$n B"
        if (n < 1024 * 1024) return "${n / 1024} KB"
        return "${"%.1f".format(n / (1024.0 * 1024.0))} MB"
    }
}
