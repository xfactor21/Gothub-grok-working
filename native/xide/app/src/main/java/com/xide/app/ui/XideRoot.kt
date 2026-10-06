package com.xide.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xide.app.data.Screen
import com.xide.app.data.TemplateId
import com.xide.app.ui.theme.Accent
import com.xide.app.ui.theme.AccentFg
import com.xide.app.ui.theme.Bg
import com.xide.app.ui.theme.Border
import com.xide.app.ui.theme.Danger
import com.xide.app.ui.theme.Elevated
import com.xide.app.ui.theme.Fg
import com.xide.app.ui.theme.Muted
import com.xide.app.ui.theme.Ok
import com.xide.app.ui.theme.Subtle
import com.xide.app.ui.theme.Surface
import com.xide.app.ui.theme.Warn
import com.xide.app.vm.XideViewModel

@Composable
fun XideRoot(vm: XideViewModel) {
    val screen by vm.screen.collectAsState()
    val status by vm.status.collectAsState()
    val currentId by vm.currentId.collectAsState()
    val project = vm.current()
    val job by vm.job.collectAsState()

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Bg)
            .statusBarsPadding()
            .imePadding(),
    ) {
        val compact = maxWidth < 720.dp
        Column(Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .border(1.dp, Border)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Elevated)
                        .border(1.dp, Border, RoundedCornerShape(6.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("x", color = Accent, fontFamily = FontFamily.Monospace, fontSize = 16.sp)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("xIDE", color = Fg, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Text(
                        "${project?.name ?: if (currentId == null) "No project" else "Project"} · v9",
                        color = Subtle,
                        fontSize = 11.sp,
                        maxLines = 1,
                    )
                }
                Text(
                    if (job.phase == "running") job.title.ifBlank { status } else status,
                    color = if (job.phase == "failed") Danger else if (job.phase == "success") Ok else Muted,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }

            Row(Modifier.weight(1f).fillMaxWidth()) {
                if (!compact) {
                    Column(
                        modifier = Modifier
                            .width(72.dp)
                            .fillMaxHeight()
                            .background(Bg)
                            .border(1.dp, Border)
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        NavItem("Home", screen == Screen.Home) { vm.go(Screen.Home) }
                        NavItem("Projects", screen == Screen.Projects) { vm.go(Screen.Projects) }
                        NavItem("Editor", screen == Screen.Editor) { vm.go(Screen.Editor) }
                        NavItem("Build", screen == Screen.Build) { vm.go(Screen.Build) }
                        NavItem("Settings", screen == Screen.Settings) { vm.go(Screen.Settings) }
                    }
                }
                Box(Modifier.weight(1f).fillMaxSize()) {
                    when (screen) {
                        Screen.Home -> HomeScreen(vm)
                        Screen.Projects -> ProjectsScreen(vm)
                        Screen.Editor -> EditorScreen(vm)
                        Screen.Build -> BuildScreen(vm)
                        Screen.Settings -> SettingsScreen(vm)
                    }
                }
            }

            if (compact) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Surface)
                        .border(1.dp, Border)
                        .navigationBarsPadding()
                        .height(56.dp),
                ) {
                    MobileTab("Home", screen == Screen.Home, Modifier.weight(1f)) { vm.go(Screen.Home) }
                    MobileTab("Projects", screen == Screen.Projects, Modifier.weight(1f)) { vm.go(Screen.Projects) }
                    MobileTab("Editor", screen == Screen.Editor, Modifier.weight(1f)) { vm.go(Screen.Editor) }
                    MobileTab("Build", screen == Screen.Build, Modifier.weight(1f)) { vm.go(Screen.Build) }
                    MobileTab("SDK", screen == Screen.Settings, Modifier.weight(1f)) { vm.go(Screen.Settings) }
                }
            }
        }
    }
}

@Composable
private fun NavItem(label: String, active: Boolean, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(60.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) Elevated else Bg)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label.take(1), color = if (active) Accent else Muted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Text(label, color = if (active) Fg else Muted, fontSize = 10.sp)
    }
}

@Composable
private fun MobileTab(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (active) Accent else Muted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun HomeScreen(vm: XideViewModel) {
    val projects by vm.projects.collectAsState()
    val toolchain by vm.toolchain.collectAsState()
    val name by vm.draftName.collectAsState()
    val template by vm.draftTemplate.collectAsState()
    val job by vm.job.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("NATIVE · THIS PHONE", style = MaterialTheme.typography.labelSmall)
        Text(
            if (projects.isEmpty()) "Start a workspace." else "Welcome back.",
            style = MaterialTheme.typography.headlineLarge,
        )
        Text(
            "This is the phone app. Edit here. Download SDK once, then Assemble builds an APK on this device — no other computer.",
            color = Muted,
            fontSize = 14.sp,
            lineHeight = 22.sp,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryBtn(if (toolchain.ready) "SDK ready" else "Download SDK") { vm.downloadSdk() }
            GhostBtn("Open projects") { vm.go(Screen.Projects) }
        }
        Card {
            Text("NEW PROJECT", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
            Field(name) { vm.setDraftName(it) }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                TemplateId.entries.forEach { t ->
                    Chip(t.label, t == template) { vm.setDraftTemplate(t) }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(template.hint, color = Subtle, fontSize = 12.sp)
            Spacer(Modifier.height(12.dp))
            PrimaryBtn("Create") { vm.create() }
        }
        Card {
            Text("SDK", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
            val tone = when {
                toolchain.ready -> Ok
                job.phase == "running" -> Warn
                toolchain.blocked != null -> Danger
                else -> Muted
            }
            Text(
                when {
                    toolchain.ready -> "Ready · ${toolchain.labels.joinToString(" · ")}"
                    job.phase == "running" -> job.detail.ifBlank { job.title }
                    toolchain.blocked != null -> toolchain.blocked!!
                    else -> "Not installed. About 3 GB, Wi-Fi, ARM64 phone."
                },
                color = tone,
                fontSize = 14.sp,
            )
        }
        if (projects.isNotEmpty()) {
            Card {
                Text("RECENT", style = MaterialTheme.typography.labelSmall)
                projects.take(4).forEach { p ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { vm.open(p.id); vm.go(Screen.Editor) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(p.name, color = Fg, fontSize = 14.sp)
                            Text(p.template.label, color = Subtle, fontSize = 12.sp)
                        }
                        Text("Open", color = Accent, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectsScreen(vm: XideViewModel) {
    val projects by vm.projects.collectAsState()
    val current by vm.currentId.collectAsState()
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("PROJECTS", style = MaterialTheme.typography.labelSmall)
        Text("On this phone", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(12.dp))
        if (projects.isEmpty()) {
            Text("No projects yet. Create one from Home.", color = Muted, fontSize = 14.sp)
        } else {
            LazyColumn {
                items(projects, key = { it.id }) { p ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (p.id == current) Elevated else Surface)
                            .border(1.dp, Border, RoundedCornerShape(8.dp))
                            .clickable { vm.open(p.id); vm.go(Screen.Editor) }
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(p.name, color = Fg, fontSize = 15.sp)
                            Text("${p.template.label} · ${p.id}", color = Subtle, fontSize = 12.sp)
                        }
                        Text("Edit", color = Accent, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun EditorScreen(vm: XideViewModel) {
    val files by vm.files.collectAsState()
    val active by vm.activeFile.collectAsState()
    val content by vm.content.collectAsState()
    val project = vm.current()
    var newPath by remember { mutableStateOf("") }
    var showNew by remember { mutableStateOf(false) }

    if (project == null) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            Text("Open a project first.", color = Muted)
            Spacer(Modifier.height(12.dp))
            PrimaryBtn("Projects") { vm.go(Screen.Projects) }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(project.name, color = Fg, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f), maxLines = 1)
            GhostBtn("Save") { vm.save() }
            GhostBtn("Assemble") { vm.assemble() }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            files.forEach { path ->
                Chip(path.substringAfterLast('/'), path == active) { vm.openFile(path) }
            }
            Chip("+ file", showNew) { showNew = !showNew }
        }
        if (showNew) {
            Row(
                modifier = Modifier.padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    Field(newPath, placeholder = "app/src/main/java/Hello.kt") { newPath = it }
                }
                PrimaryBtn("Add") {
                    if (newPath.isNotBlank()) {
                        vm.addFile(newPath)
                        newPath = ""
                        showNew = false
                    }
                }
            }
        }
        Text(
            active ?: "No file",
            color = Subtle,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(8.dp))
                .padding(10.dp),
        ) {
            val scroll = rememberScrollState()
            BasicTextField(
                value = content,
                onValueChange = { vm.setContent(it) },
                textStyle = TextStyle(
                    color = Fg,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    fontFamily = FontFamily.Monospace,
                ),
                cursorBrush = SolidColor(Accent),
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scroll),
            )
        }
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GhostBtn("Delete project") { vm.deleteCurrent() }
        }
    }
}

@Composable
private fun BuildScreen(vm: XideViewModel) {
    val logs by vm.logs.collectAsState()
    val job by vm.job.collectAsState()
    val toolchain by vm.toolchain.collectAsState()
    val listState = rememberLazyListState()
    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) listState.animateScrollToItem(logs.lastIndex)
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("BUILD", style = MaterialTheme.typography.labelSmall)
        Text(
            when (job.phase) {
                "running" -> job.title.ifBlank { "Working…" }
                "success" -> "APK ready"
                "failed" -> "Assemble failed"
                else -> "Assemble"
            },
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            job.detail.ifBlank {
                if (toolchain.ready) "Gradle assembleDebug on this phone."
                else "Download SDK in Settings before assembling."
            },
            color = Muted,
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryBtn("Assemble") { vm.assemble() }
            if (job.apkPath != null && job.phase == "success") {
                PrimaryBtn("Install APK") { vm.installApk() }
            }
            GhostBtn("Download SDK") { vm.downloadSdk() }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(8.dp)),
        ) {
            if (logs.isEmpty()) {
                Text("No log yet.", color = Subtle, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
            } else {
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(12.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(logs.size) { i ->
                        Text(
                            logs[i],
                            color = Muted,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 16.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(vm: XideViewModel) {
    val toolchain by vm.toolchain.collectAsState()
    val job by vm.job.collectAsState()
    val logs by vm.logs.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("SETTINGS", style = MaterialTheme.typography.labelSmall)
        Text("SDK on this phone", style = MaterialTheme.typography.headlineMedium)
        Card {
            Text("DOWNLOAD SDK", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "Not bundled. Same idea as AIDE: you choose Download, then JDK 11, Gradle 7.6.4, build-tools, and android-33 land in app storage. About 3 GB. ARM64 phones only. First assemble also needs Wi-Fi for Maven.",
                color = Muted,
                fontSize = 14.sp,
                lineHeight = 22.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text("CPU ${toolchain.abi}", color = Subtle, fontSize = 12.sp)
            Spacer(Modifier.height(4.dp))
            Text(
                if (toolchain.ready) "Ready · ${toolchain.labels.joinToString(" · ")}"
                else if (toolchain.blocked != null) toolchain.blocked!!
                else "Missing: ${listOf("JDK" to toolchain.jdk, "Gradle" to toolchain.gradle, "aapt2" to toolchain.aapt2, "android.jar" to toolchain.androidJar).filter { !it.second }.joinToString(" · ") { it.first }}",
                color = if (toolchain.ready) Ok else if (toolchain.blocked != null) Danger else Muted,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(12.dp))
            PrimaryBtn(
                if (job.phase == "running") "Working…" else if (toolchain.ready) "Re-check SDK" else "Download SDK",
            ) { vm.downloadSdk() }
        }
        Card {
            Text("WHAT THIS APP IS", style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "xIDE native is not a website wrapper. Assemble runs Gradle on this phone. The website preview still exists for editing in a browser; it cannot assemble on the phone.",
                color = Muted,
                fontSize = 14.sp,
                lineHeight = 22.sp,
            )
        }
        if (logs.isNotEmpty()) {
            Card {
                Text("LOG", style = MaterialTheme.typography.labelSmall)
                Spacer(Modifier.height(8.dp))
                logs.takeLast(40).forEach { line ->
                    Text(line, color = Muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                }
            }
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Surface)
            .border(1.dp, Border, RoundedCornerShape(10.dp))
            .padding(16.dp),
        content = { content() },
    )
}

@Composable
private fun PrimaryBtn(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Accent)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = AccentFg, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun GhostBtn(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, Border, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Fg, fontSize = 14.sp)
    }
}

@Composable
private fun Chip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) Accent else Elevated)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (active) AccentFg else Fg, fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
private fun Field(value: String, placeholder: String = "", onChange: (String) -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Bg)
            .border(1.dp, Border, RoundedCornerShape(6.dp))
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty() && placeholder.isNotEmpty()) {
            Text(placeholder, color = Subtle, fontSize = 14.sp)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(color = Fg, fontSize = 14.sp),
            cursorBrush = SolidColor(Accent),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
