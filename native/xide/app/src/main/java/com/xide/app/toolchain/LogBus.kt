package com.xide.app.toolchain

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object LogBus {
    private val fmt = SimpleDateFormat("HH:mm:ss", Locale.US)
    private val _lines = MutableStateFlow<List<String>>(emptyList())
    val lines: StateFlow<List<String>> = _lines
    private val _job = MutableStateFlow(com.xide.app.data.JobState())
    val job: StateFlow<com.xide.app.data.JobState> = _job

    @Synchronized
    fun add(text: String) {
        val line = "${fmt.format(Date())}  $text"
        _lines.update { (it + line).takeLast(500) }
    }

    fun clear() {
        _lines.value = emptyList()
    }

    fun job(phase: String, title: String = _job.value.title, detail: String = "", apk: String? = _job.value.apkPath) {
        _job.value = com.xide.app.data.JobState(phase, title, detail, apk)
        if (detail.isNotBlank()) add(detail)
        else if (title.isNotBlank()) add(title)
    }
}
