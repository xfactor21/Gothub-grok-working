package com.xide.app.vm

import android.app.Application
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import com.xide.app.XideApp
import com.xide.app.compile.Shell
import com.xide.app.compile.XideService
import com.xide.app.design.DesignWriter
import com.xide.app.design.UiBlock
import com.xide.app.data.JobState
import com.xide.app.data.Project
import com.xide.app.data.Screen
import com.xide.app.data.TemplateId
import com.xide.app.data.ToolchainStatus
import com.xide.app.toolchain.LogBus
import com.xide.app.toolchain.Toolchain
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import kotlin.concurrent.thread

class XideViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = (app as XideApp).projects

    private val _screen = MutableStateFlow(Screen.Home)
    val screen: StateFlow<Screen> = _screen
    private val _projects = MutableStateFlow(repo.list())
    val projects: StateFlow<List<Project>> = _projects
    private val _currentId = MutableStateFlow<String?>(null)
    val currentId: StateFlow<String?> = _currentId
    private val _files = MutableStateFlow<List<String>>(emptyList())
    val files: StateFlow<List<String>> = _files
    private val _activeFile = MutableStateFlow<String?>(null)
    val activeFile: StateFlow<String?> = _activeFile
    private val _content = MutableStateFlow("")
    val content: StateFlow<String> = _content
    private val _toolchain = MutableStateFlow(Toolchain.probe(app))
    val toolchain: StateFlow<ToolchainStatus> = _toolchain
    val logs: StateFlow<List<String>> = LogBus.lines
    val job: StateFlow<JobState> = LogBus.job
    private val _draftName = MutableStateFlow("Pulse")
    val draftName: StateFlow<String> = _draftName
    private val _draftTemplate = MutableStateFlow(TemplateId.AndroidCompose)
    val draftTemplate: StateFlow<TemplateId> = _draftTemplate
    private val _status = MutableStateFlow("Native · this phone")
    val status: StateFlow<String> = _status

    fun go(s: Screen) {
        _screen.value = s
        if (s == Screen.Settings || s == Screen.Build || s == Screen.Home) refreshToolchain()
    }

    fun setDraftName(v: String) {
        _draftName.value = v
    }

    fun setDraftTemplate(t: TemplateId) {
        _draftTemplate.value = t
    }

    fun create() {
        val p = repo.create(_draftName.value, _draftTemplate.value)
        refresh()
        open(p.id)
        _screen.value = Screen.Editor
        _status.value = "Created ${p.name}"
    }

    fun open(id: String) {
        _currentId.value = id
        _files.value = repo.listFiles(id)
        val first = _files.value.firstOrNull {
            it.endsWith(".kt") || it.endsWith(".java")
        } ?: _files.value.firstOrNull()
        if (first != null) openFile(first) else {
            _activeFile.value = null
            _content.value = ""
        }
        _status.value = repo.get(id)?.name ?: id
    }

    fun openFile(path: String) {
        val id = _currentId.value ?: return
        _activeFile.value = path
        _content.value = repo.read(id, path)
    }

    fun setContent(v: String) {
        _content.value = v
    }

    fun save() {
        val id = _currentId.value ?: return
        val path = _activeFile.value ?: return
        repo.write(id, path, _content.value)
        _status.value = "Saved $path"
    }

    fun addFile(path: String) {
        val id = _currentId.value ?: return
        repo.createFile(id, path)
        _files.value = repo.listFiles(id)
        openFile(path.trim().trimStart('/'))
    }

    fun deleteCurrent() {
        val id = _currentId.value ?: return
        repo.delete(id)
        _currentId.value = null
        _files.value = emptyList()
        _activeFile.value = null
        _content.value = ""
        refresh()
        _screen.value = Screen.Projects
    }

    fun refresh() {
        _projects.value = repo.list()
        _currentId.value?.let { _files.value = repo.listFiles(it) }
        refreshToolchain()
    }

    fun refreshToolchain() {
        _toolchain.value = Toolchain.probe(getApplication())
    }

    fun downloadSdk() {
        _screen.value = Screen.Settings
        XideService.installSdk(getApplication())
    }

    fun assemble() {
        val id = _currentId.value
        if (id == null) {
            _status.value = "Open a project first"
            _screen.value = Screen.Projects
            return
        }
        save()
        _screen.value = Screen.Build
        XideService.assemble(getApplication(), id)
    }

    fun installApk() {
        val path = job.value.apkPath ?: return
        val ctx = getApplication<Application>()
        val file = File(path)
        if (!file.exists()) return
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(android.net.Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            _status.value = "Allow xIDE to install apps, then tap Install APK again"
            return
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
        val i = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
    }

    fun current(): Project? = _currentId.value?.let { repo.get(it) }

    fun runShell(line: String) {
        val cmd = line.trim()
        if (cmd.isEmpty()) return
        _screen.value = Screen.Terminal
        thread(name = "xide-shell") {
            try {
                Shell.run(getApplication(), _currentId.value, cmd)
            } catch (t: Throwable) {
                LogBus.add(t.message ?: "shell failed")
            }
        }
    }

    fun loadDesign(): List<UiBlock> {
        val id = _currentId.value ?: return emptyList()
        return DesignWriter.load(repo, id)
    }

    fun writeDesign(blocks: List<UiBlock>) {
        val id = _currentId.value ?: return
        DesignWriter.write(repo, id, blocks)
        _files.value = repo.listFiles(id)
        val gen = _files.value.firstOrNull { it.endsWith("GeneratedUi.kt") }
        if (gen != null) openFile(gen)
        _status.value = "Wrote GeneratedUi.kt"
        _screen.value = Screen.Editor
    }
}
