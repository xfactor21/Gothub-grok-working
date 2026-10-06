# xIDE v9

Android IDE. Two parts:

- **Native app** (`native/xide`) — install on an ARM64 phone, tap Download SDK, then Assemble. This is the compiler.
- **Website** (`src`) — browser editor. It cannot compile on a phone.

## Install the phone app

1. On the phone, open the latest release and download **xide-native.apk**.
2. Allow install from that source if Android asks.
3. Open **xIDE** → Settings → **Download SDK** (~3 GB, Wi-Fi).
4. Create an Android project → **Assemble**. First Gradle run needs Wi-Fi for Maven.

Debug APK, not Play Store. ARM64 phones, Android 8+. User projects on-device use JDK 11 / Gradle 7.6 / compileSdk 33.

Native source is in `native/xide`. The APK on the GitHub release is already assembled.