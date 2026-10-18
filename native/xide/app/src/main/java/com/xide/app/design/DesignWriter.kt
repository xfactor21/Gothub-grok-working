package com.xide.app.design

import com.xide.app.data.ProjectRepository
import org.json.JSONArray
import org.json.JSONObject

data class UiBlock(val kind: String, val text: String)

object DesignWriter {
    val kinds = listOf("title", "text", "button", "spacer")

    fun write(repo: ProjectRepository, projectId: String, blocks: List<UiBlock>) {
        val files = repo.listFiles(projectId)
        val main = files.firstOrNull { it.endsWith("/MainActivity.kt") || it.endsWith("MainActivity.kt") }
        val src = if (main != null) repo.read(projectId, main) else ""
        val pkg = src.lineSequence().firstOrNull { it.startsWith("package ") }
            ?.removePrefix("package ")?.trim()?.trimEnd(';')
            ?: "com.xide.user.app"
        val dir = main?.substringBeforeLast('/') ?: "app/src/main/java/${pkg.replace('.', '/')}"
        repo.write(projectId, "$dir/GeneratedUi.kt", kotlin(pkg, blocks))
        repo.write(projectId, "design/home.json", json(blocks))
        if (main != null && !src.contains("GeneratedHome(")) {
            val patched = src.replace(Regex("""Home\s*\([^)]*\)"""), "GeneratedHome()")
            if (patched != src) repo.write(projectId, main, patched)
        }
    }

    fun load(repo: ProjectRepository, projectId: String): List<UiBlock> {
        val raw = repo.read(projectId, "design/home.json")
        if (raw.isBlank()) {
            return listOf(
                UiBlock("title", "Pulse"),
                UiBlock("text", "Built on this phone with xIDE."),
                UiBlock("button", "Continue"),
            )
        }
        return try {
            val arr = JSONObject(raw).getJSONArray("blocks")
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(UiBlock(o.getString("kind"), o.optString("text")))
                }
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private fun json(blocks: List<UiBlock>): String {
        val arr = JSONArray()
        blocks.forEach { b ->
            arr.put(JSONObject().put("kind", b.kind).put("text", b.text))
        }
        return JSONObject().put("blocks", arr).toString(2) + "\n"
    }

    private fun kotlin(pkg: String, blocks: List<UiBlock>): String {
        val body = blocks.joinToString("\n") { b ->
            when (b.kind) {
                "title" -> """        Text(text = ${str(b.text)}, style = MaterialTheme.typography.headlineLarge)"""
                "button" -> """        Button(onClick = {}) { Text(text = ${str(b.text)}) }"""
                "spacer" -> """        Spacer(modifier = Modifier.height(${b.text.filter { it.isDigit() }.ifBlank { "16" }}.dp))"""
                else -> """        Text(text = ${str(b.text)}, style = MaterialTheme.typography.bodyLarge)"""
            }
        }
        return """
            package $pkg

            import androidx.compose.foundation.layout.Arrangement
            import androidx.compose.foundation.layout.Column
            import androidx.compose.foundation.layout.Spacer
            import androidx.compose.foundation.layout.fillMaxSize
            import androidx.compose.foundation.layout.height
            import androidx.compose.foundation.layout.padding
            import androidx.compose.material3.Button
            import androidx.compose.material3.MaterialTheme
            import androidx.compose.material3.Text
            import androidx.compose.runtime.Composable
            import androidx.compose.ui.Modifier
            import androidx.compose.ui.unit.dp

            @Composable
            fun GeneratedHome() {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
            $body
                }
            }
        """.trimIndent() + "\n"
    }

    private fun str(v: String): String = "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
