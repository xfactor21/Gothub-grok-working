package com.xide.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

class ProjectRepository(ctx: Context) {
    private val root = File(ctx.filesDir, "projects").also { it.mkdirs() }
    private val indexFile = File(root, "index.json")

    fun list(): List<Project> = loadIndex().sortedByDescending { it.updatedAt }

    fun get(id: String): Project? = loadIndex().find { it.id == id }

    fun dir(id: String): File = File(root, id).also { it.mkdirs() }

    fun create(name: String, template: TemplateId): Project {
        val id = "p_" + UUID.randomUUID().toString().take(8)
        val now = System.currentTimeMillis()
        val p = Project(id, name.trim().ifBlank { "Untitled" }, template, now, now)
        val dir = dir(id)
        ProjectTemplates.files(p.name, template).forEach { (path, content) ->
            val f = File(dir, path)
            f.parentFile?.mkdirs()
            f.writeText(content)
        }
        saveIndex(loadIndex() + p)
        return p
    }

    fun touch(id: String) {
        saveIndex(loadIndex().map { if (it.id == id) it.copy(updatedAt = System.currentTimeMillis()) else it })
    }

    fun delete(id: String) {
        dir(id).deleteRecursively()
        saveIndex(loadIndex().filterNot { it.id == id })
    }

    fun listFiles(id: String): List<String> {
        val base = dir(id)
        if (!base.exists()) return emptyList()
        return base.walkTopDown()
            .filter { it.isFile }
            .map { it.relativeTo(base).path.replace(File.separatorChar, '/') }
            .filterNot { skip(it) }
            .sorted()
            .toList()
    }

    fun read(id: String, path: String): String {
        val f = resolve(id, path)
        return if (f.exists()) f.readText() else ""
    }

    fun write(id: String, path: String, content: String) {
        val f = resolve(id, path)
        f.parentFile?.mkdirs()
        f.writeText(content)
        touch(id)
    }

    fun createFile(id: String, path: String) {
        val clean = path.trim().trimStart('/')
        if (clean.isBlank()) return
        write(id, clean, "")
    }

    private fun resolve(id: String, path: String): File {
        val base = dir(id).canonicalFile
        val out = File(base, path).canonicalFile
        require(out.path.startsWith(base.path)) { "bad path" }
        return out
    }

    private fun skip(path: String): Boolean {
        val p = path.lowercase()
        return p.startsWith("app/build/") ||
            p.startsWith("build/") ||
            p.startsWith(".gradle/") ||
            p.contains("/.gradle/") ||
            p.endsWith(".class") ||
            p.endsWith(".dex") ||
            p.endsWith(".apk")
    }

    private fun loadIndex(): List<Project> {
        if (!indexFile.exists()) return emptyList()
        return try {
            val arr = JSONArray(indexFile.readText())
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(
                        Project(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            template = TemplateId.valueOf(o.optString("template", TemplateId.Empty.name)),
                            createdAt = o.optLong("createdAt"),
                            updatedAt = o.optLong("updatedAt"),
                        ),
                    )
                }
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private fun saveIndex(items: List<Project>) {
        val arr = JSONArray()
        items.forEach { p ->
            arr.put(
                JSONObject()
                    .put("id", p.id)
                    .put("name", p.name)
                    .put("template", p.template.name)
                    .put("createdAt", p.createdAt)
                    .put("updatedAt", p.updatedAt),
            )
        }
        indexFile.writeText(arr.toString(2))
    }
}
