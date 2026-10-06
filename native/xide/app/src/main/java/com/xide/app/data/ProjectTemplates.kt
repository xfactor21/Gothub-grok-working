package com.xide.app.data

object ProjectTemplates {
    fun files(name: String, template: TemplateId): Map<String, String> {
        val pkg = name.lowercase().replace(Regex("[^a-z0-9]"), "").ifBlank { "app" }
        val appId = "com.xide.user.$pkg"
        return when (template) {
            TemplateId.AndroidCompose -> androidKotlin(name, pkg, appId)
            TemplateId.AndroidJava -> androidJava(name, pkg, appId)
            TemplateId.Empty -> mapOf(
                "README.md" to "# $name\n\nEmpty xIDE project. Add files, then assemble if this is an Android Gradle tree.\n",
            )
        }
    }

    private fun androidKotlin(name: String, pkg: String, appId: String) = mapOf(
        "README.md" to """
            # $name

            Kotlin + Compose. On this phone, xIDE runs Gradle `assembleDebug` after Download SDK.

            First assemble needs Wi-Fi (Gradle plugins). Later builds stay on the device.
        """.trimIndent() + "\n",
        "settings.gradle.kts" to """
            pluginManagement {
                repositories { google(); mavenCentral(); gradlePluginPortal() }
            }
            dependencyResolutionManagement {
                repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
                repositories { google(); mavenCentral() }
            }
            rootProject.name = "$name"
            include(":app")
        """.trimIndent() + "\n",
        "build.gradle.kts" to """
            plugins {
                id("com.android.application") version "7.4.2" apply false
                id("org.jetbrains.kotlin.android") version "1.8.22" apply false
            }
        """.trimIndent() + "\n",
        "gradle.properties" to """
            org.gradle.jvmargs=-Xmx768m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8
            org.gradle.daemon=false
            org.gradle.vfs.watch=false
            android.useAndroidX=true
            android.nonTransitiveRClass=true
            kotlin.compiler.execution.strategy=in-process
            kotlin.code.style=official
        """.trimIndent() + "\n",
        "app/build.gradle.kts" to """
            plugins {
                id("com.android.application")
                id("org.jetbrains.kotlin.android")
            }
            android {
                namespace = "$appId"
                compileSdk = 33
                defaultConfig {
                    applicationId = "$appId"
                    minSdk = 26
                    targetSdk = 33
                    versionCode = 1
                    versionName = "1.0"
                }
                buildTypes {
                    release { isMinifyEnabled = false }
                    debug { isMinifyEnabled = false }
                }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_11
                    targetCompatibility = JavaVersion.VERSION_11
                }
                kotlinOptions { jvmTarget = "11" }
                buildFeatures { compose = true }
                composeOptions { kotlinCompilerExtensionVersion = "1.4.8" }
            }
            dependencies {
                implementation("androidx.core:core-ktx:1.10.1")
                implementation("androidx.activity:activity-compose:1.7.2")
                implementation("androidx.compose.ui:ui:1.4.3")
                implementation("androidx.compose.material3:material3:1.1.2")
            }
        """.trimIndent() + "\n",
        "app/src/main/AndroidManifest.xml" to """
            <?xml version="1.0" encoding="utf-8"?>
            <manifest xmlns:android="http://schemas.android.com/apk/res/android">
                <application
                    android:label="$name"
                    android:theme="@style/Theme.User">
                    <activity
                        android:name=".MainActivity"
                        android:exported="true">
                        <intent-filter>
                            <action android:name="android.intent.action.MAIN" />
                            <category android:name="android.intent.category.LAUNCHER" />
                        </intent-filter>
                    </activity>
                </application>
            </manifest>
        """.trimIndent() + "\n",
        "app/src/main/res/values/themes.xml" to """
            <?xml version="1.0" encoding="utf-8"?>
            <resources>
                <style name="Theme.User" parent="android:Theme.Material.Light.NoActionBar" />
            </resources>
        """.trimIndent() + "\n",
        "app/src/main/java/com/xide/user/$pkg/MainActivity.kt" to """
            package com.xide.user.$pkg

            import android.os.Bundle
            import androidx.activity.ComponentActivity
            import androidx.activity.compose.setContent
            import androidx.compose.foundation.layout.Arrangement
            import androidx.compose.foundation.layout.Column
            import androidx.compose.foundation.layout.fillMaxSize
            import androidx.compose.foundation.layout.padding
            import androidx.compose.material3.MaterialTheme
            import androidx.compose.material3.Surface
            import androidx.compose.material3.Text
            import androidx.compose.runtime.Composable
            import androidx.compose.ui.Modifier
            import androidx.compose.ui.unit.dp

            class MainActivity : ComponentActivity() {
                override fun onCreate(savedInstanceState: Bundle?) {
                    super.onCreate(savedInstanceState)
                    setContent {
                        MaterialTheme {
                            Surface(modifier = Modifier.fillMaxSize()) {
                                Home(title = "$name")
                            }
                        }
                    }
                }
            }

            @Composable
            fun Home(title: String) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(text = title, style = MaterialTheme.typography.headlineLarge)
                    Text(
                        text = "Built on this phone with xIDE.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        """.trimIndent() + "\n",
    )

    private fun androidJava(name: String, pkg: String, appId: String) = mapOf(
        "README.md" to "# $name\n\nJava Android app. Assemble on this phone after Download SDK.\n",
        "settings.gradle.kts" to """
            pluginManagement {
                repositories { google(); mavenCentral(); gradlePluginPortal() }
            }
            dependencyResolutionManagement {
                repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
                repositories { google(); mavenCentral() }
            }
            rootProject.name = "$name"
            include(":app")
        """.trimIndent() + "\n",
        "build.gradle.kts" to """
            plugins {
                id("com.android.application") version "7.4.2" apply false
            }
        """.trimIndent() + "\n",
        "gradle.properties" to """
            org.gradle.jvmargs=-Xmx768m -Dfile.encoding=UTF-8
            org.gradle.daemon=false
            org.gradle.vfs.watch=false
            android.useAndroidX=true
        """.trimIndent() + "\n",
        "app/build.gradle.kts" to """
            plugins { id("com.android.application") }
            android {
                namespace = "$appId"
                compileSdk = 33
                defaultConfig {
                    applicationId = "$appId"
                    minSdk = 26
                    targetSdk = 33
                    versionCode = 1
                    versionName = "1.0"
                }
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_11
                    targetCompatibility = JavaVersion.VERSION_11
                }
            }
        """.trimIndent() + "\n",
        "app/src/main/AndroidManifest.xml" to """
            <?xml version="1.0" encoding="utf-8"?>
            <manifest xmlns:android="http://schemas.android.com/apk/res/android">
                <application android:label="$name" android:theme="@android:style/Theme.Material.Light.NoActionBar">
                    <activity android:name=".MainActivity" android:exported="true">
                        <intent-filter>
                            <action android:name="android.intent.action.MAIN" />
                            <category android:name="android.intent.category.LAUNCHER" />
                        </intent-filter>
                    </activity>
                </application>
            </manifest>
        """.trimIndent() + "\n",
        "app/src/main/java/com/xide/user/$pkg/MainActivity.java" to """
            package com.xide.user.$pkg;

            import android.app.Activity;
            import android.os.Bundle;
            import android.widget.TextView;

            public class MainActivity extends Activity {
                @Override
                protected void onCreate(Bundle savedInstanceState) {
                    super.onCreate(savedInstanceState);
                    TextView tv = new TextView(this);
                    tv.setText("$name — built on this phone with xIDE.");
                    tv.setPadding(48, 48, 48, 48);
                    tv.setTextSize(20);
                    setContentView(tv);
                }
            }
        """.trimIndent() + "\n",
    )
}
