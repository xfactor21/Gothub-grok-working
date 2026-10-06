# xIDE Compile Host

Runs the real Android / Kotlin / Java toolchain on a computer you keep, so xIDE can assemble debug APKs after the Grok preview is gone.

This is **not** the editor. It is the machine that compiles. Leave it running while you press Assemble APK in xIDE.

Download this folder from **xIDE → Settings → Download host**.

## What you need

- A computer that stays on (Windows, Mac, or Linux)
- [Node.js 18+](https://nodejs.org) (LTS)
- Disk space for the Android SDK (several GB)
- A network connection for the **first** start (downloads JDK 17 if missing, Gradle, Kotlin, Android SDK 35)

Nothing is simulated. If the SDK is not installed yet, APK assemble is skipped honestly.

## Start

**Windows:** double-click `Start.bat`

**Mac:** double-click `Start.command` (first time: right-click → Open)

**Linux:** run `Start.sh`

The first start installs the toolchain. That can take several minutes. Later starts are fast.

When it is ready, your browser opens a status page with addresses. Copy one into **xIDE → Settings → Compile URL**, then **Check host**.

- **This computer** — xIDE is open in a browser on the same machine
- **This network** — xIDE is open on your phone on the same Wi-Fi (the browser may block this; if Check host fails, open xIDE on the computer running the host)

Leave this window running. Sleeping the computer pauses compiles.

## Limits

- Debug APKs only (`assembleDebug`), Android API 35
- No emulator, no Play Store signing
- About 120 source files per job
- APK attach cap 30 MB

## Host elsewhere

Same package on a VPS or always-on box. Start it, then paste that machine’s address into xIDE Settings. A normal website host (Vercel and similar) will **not** work — those do not ship the Android SDK.

## Layout after setup

```
xide-compile-host/
  Start.bat / Start.command / Start.sh
  server.mjs
  setup.mjs
  compile.mjs
  toolchains/          (created on first start — JDK, Gradle, Kotlin, Android SDK)
```
