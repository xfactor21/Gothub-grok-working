#!/usr/bin/env node
/**
 * First-run installer for xIDE Compile Host.
 * Downloads JDK 17 (if needed), Gradle 8.12.1, kotlinc 2.1.10, Android SDK 35.
 * Honest: prints what it finds vs what it fetches. Never fakes a toolchain.
 */
import { spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "toolchains");
const GRADLE_VER = "8.12.1";
const KOTLIN_VER = "2.1.10";
const CMDLINE_VER = "11076708";
const exe = process.platform === "win32" ? ".exe" : "";

function log(msg) {
  console.log(msg);
}

function plat() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function arch() {
  if (process.arch === "arm64") return "aarch64";
  return "x64";
}

function markExec(p) {
  if (process.platform === "win32" || !p || !existsSync(p)) return;
  try {
    chmodSync(p, 0o755);
  } catch {
    /* zip bits are enough on most systems */
  }
}

function run(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd ?? HERE,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: opts.shell ?? (process.platform === "win32" && /\.(bat|cmd)$/i.test(file)),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = d.toString("utf8");
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr?.on("data", (d) => {
      const s = d.toString("utf8");
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${file} exited ${code}`));
    });
  });
}

async function download(url, dest) {
  log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status} ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
  log(`Saved ${dest}`);
}

async function extract(archive, dest) {
  mkdirSync(dest, { recursive: true });
  if (process.platform === "win32") {
    await run("tar", ["-xf", archive, "-C", dest]);
    return;
  }
  if (archive.endsWith(".tar.gz") || archive.endsWith(".tgz")) {
    await run("tar", ["-xzf", archive, "-C", dest]);
    return;
  }
  if (existsSync("/usr/bin/unzip") || (await which("unzip"))) {
    await run("unzip", ["-o", "-q", archive, "-d", dest]);
    return;
  }
  await run("tar", ["-xf", archive, "-C", dest]);
}

function which(cmd) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function onlyChildDir(dir) {
  const names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory());
  return names.length === 1 ? join(dir, names[0].name) : null;
}

function findJavaHome() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  candidates.push(join(ROOT, "jdk"));
  candidates.push("/usr/lib/jvm/java-17-openjdk-amd64");
  candidates.push("/usr/lib/jvm/java-17-openjdk");
  if (process.platform === "darwin") {
    candidates.push("/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home");
  }
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  candidates.push(join(pf, "Eclipse Adoptium", "jdk-17"));
  candidates.push(join(pf, "Java", "jdk-17"));
  for (const c of candidates) {
    if (c && existsSync(join(c, "bin", `java${exe}`))) return c;
  }
  return "";
}

async function ensureJdk() {
  let home = findJavaHome();
  if (home) {
    log(`JDK found: ${home}`);
    return home;
  }
  log("No JDK 17 found — fetching Eclipse Temurin 17");
  const os = plat();
  const a = arch();
  const url = `https://api.adoptium.net/v3/binary/latest/17/ga/${os}/${a}/jdk/hotspot/normal/eclipse?project=jdk`;
  const ext = os === "windows" ? "zip" : "tar.gz";
  const archive = join(tmpdir(), `xide-jdk-17.${ext}`);
  await download(url, archive);
  const unpack = join(ROOT, "_jdk-unpack");
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  await extract(archive, unpack);
  const inner = (await onlyChildDir(unpack)) || unpack;
  const dest = join(ROOT, "jdk");
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  await rename(inner, dest).catch(async () => {
    await cp(inner, dest, { recursive: true });
  });
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  if (!existsSync(join(dest, "bin", `java${exe}`))) {
    throw new Error("JDK download did not contain a java binary");
  }
  markExec(join(dest, "bin", `java${exe}`));
  markExec(join(dest, "bin", `javac${exe}`));
  log(`JDK installed: ${dest}`);
  return dest;
}

async function ensureGradle() {
  const script = process.platform === "win32" ? "gradle.bat" : "gradle";
  const dest = join(ROOT, `gradle-${GRADLE_VER}`);
  const bin = join(dest, "bin", script);
  if (existsSync(bin)) {
    markExec(bin);
    log(`Gradle found: ${bin}`);
    return bin;
  }
  log(`Fetching Gradle ${GRADLE_VER}`);
  const archive = join(tmpdir(), `gradle-${GRADLE_VER}-bin.zip`);
  await download(
    `https://services.gradle.org/distributions/gradle-${GRADLE_VER}-bin.zip`,
    archive,
  );
  const unpack = join(ROOT, "_gradle-unpack");
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  await extract(archive, unpack);
  const inner = (await onlyChildDir(unpack)) || unpack;
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  await rename(inner, dest).catch(async () => {
    await cp(inner, dest, { recursive: true });
  });
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  if (!existsSync(bin)) throw new Error("Gradle extract failed");
  markExec(bin);
  log(`Gradle installed: ${bin}`);
  return bin;
}

async function ensureKotlinc() {
  const script = process.platform === "win32" ? "kotlinc.bat" : "kotlinc";
  const dest = join(ROOT, "kotlinc");
  const bin = join(dest, "bin", script);
  if (existsSync(bin)) {
    markExec(bin);
    log(`kotlinc found: ${bin}`);
    return bin;
  }
  log(`Fetching Kotlin compiler ${KOTLIN_VER}`);
  const archive = join(tmpdir(), `kotlin-compiler-${KOTLIN_VER}.zip`);
  await download(
    `https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VER}/kotlin-compiler-${KOTLIN_VER}.zip`,
    archive,
  );
  const unpack = join(ROOT, "_kotlin-unpack");
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  await extract(archive, unpack);
  const inner = existsSync(join(unpack, "kotlinc")) ? join(unpack, "kotlinc") : await onlyChildDir(unpack);
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  await rename(inner, dest).catch(async () => {
    await cp(inner, dest, { recursive: true });
  });
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  if (!existsSync(bin)) throw new Error("kotlinc extract failed");
  markExec(bin);
  log(`kotlinc installed: ${bin}`);
  return bin;
}

async function ensureAndroidSdk(javaHome) {
  const sdk = join(ROOT, "android-sdk");
  const sdkmanager = join(
    sdk,
    "cmdline-tools",
    "latest",
    "bin",
    process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager",
  );
  mkdirSync(sdk, { recursive: true });
  if (!existsSync(sdkmanager)) {
    log("Fetching Android command-line tools");
    const zipName = `commandlinetools-${plat() === "mac" ? "mac" : plat() === "windows" ? "win" : "linux"}-${CMDLINE_VER}_latest.zip`;
    const archive = join(tmpdir(), zipName);
    await download(`https://dl.google.com/android/repository/${zipName}`, archive);
    const unpack = join(ROOT, "_sdk-unpack");
    await rm(unpack, { recursive: true, force: true }).catch(() => {});
    await extract(archive, unpack);
    const latest = join(sdk, "cmdline-tools", "latest");
    mkdirSync(join(sdk, "cmdline-tools"), { recursive: true });
    await rm(latest, { recursive: true, force: true }).catch(() => {});
    const inner = existsSync(join(unpack, "cmdline-tools"))
      ? join(unpack, "cmdline-tools")
      : unpack;
    await rename(inner, latest).catch(async () => {
      await cp(inner, latest, { recursive: true });
    });
    await rm(unpack, { recursive: true, force: true }).catch(() => {});
  }
  if (!existsSync(sdkmanager)) throw new Error("sdkmanager missing after extract");
  markExec(sdkmanager);

  const env = {
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
  };
  log("Accepting Android SDK licenses");
  await new Promise((resolve, reject) => {
    const child = spawn(sdkmanager, ["--sdk_root=" + sdk, "--licenses"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    child.stdin.write("y\n".repeat(80));
    child.stdin.end();
    child.stdout?.on("data", (d) => process.stdout.write(d));
    child.stderr?.on("data", (d) => process.stderr.write(d));
    child.on("error", reject);
    child.on("close", () => resolve());
  });

  const needPlat = !existsSync(join(sdk, "platforms", "android-35"));
  const needBuild = !existsSync(join(sdk, "build-tools", "35.0.0"));
  if (needPlat || needBuild) {
    log("Installing Android SDK 35 (platforms + build-tools + platform-tools)");
    await run(
      sdkmanager,
      [
        "--sdk_root=" + sdk,
        "platforms;android-35",
        "build-tools;35.0.0",
        "platform-tools",
      ],
      { env },
    );
  } else {
    log("Android SDK 35 already present");
  }
  if (!existsSync(join(sdk, "platforms")) || !existsSync(join(sdk, "build-tools"))) {
    throw new Error("Android SDK install did not produce platforms/build-tools");
  }
  return sdk;
}

async function main() {
  log("xIDE Compile Host setup");
  mkdirSync(ROOT, { recursive: true });
  const javaHome = await ensureJdk();
  const gradle = await ensureGradle();
  const kotlinc = await ensureKotlinc();
  const androidHome = await ensureAndroidSdk(javaHome);
  const env = {
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    GRADLE: gradle,
    KOTLINC: kotlinc,
    GRADLE_USER_HOME: join(ROOT, "gradle-home"),
  };
  writeFileSync(join(ROOT, "env.json"), JSON.stringify(env, null, 2));
  log("");
  log("Setup complete. Starting the compile host is next.");
  log(`JAVA_HOME=${javaHome}`);
  log(`ANDROID_HOME=${androidHome}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
