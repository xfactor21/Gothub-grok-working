package com.xide.app.data

enum class Screen { Home, Projects, Editor, Design, Terminal, Build, Settings }

enum class TemplateId(val label: String, val hint: String) {
    AndroidCompose("Android App", "Kotlin + Compose. Assemble on this phone after Download SDK."),
    AndroidJava("Android Java", "Java Activity. Same on-device Gradle path."),
    Empty("Empty", "Blank project folder."),
}

data class Project(
    val id: String,
    val name: String,
    val template: TemplateId,
    val createdAt: Long,
    val updatedAt: Long,
)

data class ToolchainStatus(
    val jdk: Boolean = false,
    val gradle: Boolean = false,
    val aapt2: Boolean = false,
    val androidJar: Boolean = false,
    val abi: String = "",
    val jdkHome: String? = null,
    val gradleLauncher: String? = null,
    val sdkHome: String? = null,
    val labels: List<String> = emptyList(),
    val blocked: String? = null,
) {
    val ready: Boolean get() = jdk && gradle && aapt2 && androidJar
}

data class JobState(
    val phase: String = "idle",
    val title: String = "",
    val detail: String = "",
    val apkPath: String? = null,
)
