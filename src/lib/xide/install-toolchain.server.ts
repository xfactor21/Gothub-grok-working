import { spawn } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
} from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  describeToolchain,
  installCapability,
  resolveToolchain,
  toolchainRoot,
  type ToolchainStatus,
} from "./toolchain.server";

const GRADLE_VER = "8.12.1";
const KOTLIN_VER = "2.1.10";
const CMDLINE_VER = "11076708";

export type InstallPhase = "idle" | "running" | "success" | "failed";

export type InstallStatus = {
  phase: InstallPhase;
  logs: string[];
  error?: string;
  toolchain: ToolchainStatus;
  canInstall: boolean;
  installBlocked?: string;
};

type Job = {
  phase: InstallPhase;
  logs: string[];
  error?: string;
};

const job: Job = { phase: "idle", logs: [] };

function plat(): "windows" | "mac" | "linux" {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function arch(): "aarch64" | "x64" {
  return process.arch === "arm64" ? "aarch64" : "x64";
}

function markExec(p: string) {
  if (process.platform === "win32" || !p || !existsSync(p)) return;
  try {
    chmodSync(p, 0o755);
  } catch {
    /* zip bits are often enough */
  }
}

function pushLog(msg: string) {
  const t = msg.replace(/\s+/g, " ").trim();
  if (!t) return;
  job.logs.push(t);
  if (job.logs.length > 160) job.logs.splice(0, job.logs.length - 120);
}

function run(
  file: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" && /\.(bat|cmd)$/i.test(file),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stdout += s;
      for (const line of s.split("\n")) {
        const t = line.trim();
        if (t && t.length < 220) pushLog(t);
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stderr += s;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${file} timed out`));
    }, opts.timeoutMs ?? 180_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${file} exited ${code}`));
    });
  });
}

async function download(url: string, dest: string) {
  pushLog(`Downloading ${url.split("/").pop() || "archive"}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

async function extract(archive: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  if (archive.endsWith(".tar.gz") || archive.endsWith(".tgz")) {
    await run("tar", ["-xzf", archive, "-C", dest]);
    return;
  }
  try {
    await run("unzip", ["-o", "-q", archive, "-d", dest]);
    return;
  } catch {
    /* unzip missing */
  }
  try {
    await run("tar", ["-xf", archive, "-C", dest]);
    return;
  } catch {
    /* tar may not speak zip */
  }
  await run("python3", [
    "-c",
    "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
    archive,
    dest,
  ]);
}

async function onlyChildDir(dir: string): Promise<string | null> {
  const names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory());
  return names.length === 1 ? join(dir, names[0]!.name) : null;
}

async function ensureJdk(root: string): Promise<string> {
  const existing = resolveToolchain().javaHome;
  if (existing) {
    pushLog("JDK already present");
    return existing;
  }
  pushLog("No JDK 17 found — fetching Eclipse Temurin 17");
  const os = plat();
  const a = arch();
  const ext = os === "windows" ? "zip" : "tar.gz";
  const archive = join(tmpdir(), `xide-jdk-17.${ext}`);
  await download(
    `https://api.adoptium.net/v3/binary/latest/17/ga/${os}/${a}/jdk/hotspot/normal/eclipse?project=jdk`,
    archive,
  );
  const unpack = join(root, "_jdk-unpack");
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  await extract(archive, unpack);
  const inner = (await onlyChildDir(unpack)) || unpack;
  const dest = join(root, "jdk");
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  await rename(inner, dest).catch(async () => {
    await cp(inner, dest, { recursive: true });
  });
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  const java = join(dest, "bin", process.platform === "win32" ? "java.exe" : "java");
  if (!existsSync(java)) throw new Error("JDK download did not contain a java binary");
  markExec(java);
  markExec(join(dest, "bin", process.platform === "win32" ? "javac.exe" : "javac"));
  pushLog("JDK 17 installed");
  return dest;
}

async function ensureGradle(root: string): Promise<void> {
  const script = process.platform === "win32" ? "gradle.bat" : "gradle";
  const dest = join(root, `gradle-${GRADLE_VER}`);
  const bin = join(dest, "bin", script);
  if (existsSync(bin)) {
    markExec(bin);
    pushLog("Gradle already present");
    return;
  }
  pushLog(`Fetching Gradle ${GRADLE_VER}`);
  const archive = join(tmpdir(), `gradle-${GRADLE_VER}-bin.zip`);
  await download(
    `https://services.gradle.org/distributions/gradle-${GRADLE_VER}-bin.zip`,
    archive,
  );
  const unpack = join(root, "_gradle-unpack");
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
  pushLog("Gradle installed");
}

async function ensureKotlinc(root: string): Promise<void> {
  const script = process.platform === "win32" ? "kotlinc.bat" : "kotlinc";
  const dest = join(root, "kotlinc");
  const bin = join(dest, "bin", script);
  if (existsSync(bin)) {
    markExec(bin);
    pushLog("kotlinc already present");
    return;
  }
  pushLog(`Fetching Kotlin compiler ${KOTLIN_VER}`);
  const archive = join(tmpdir(), `kotlin-compiler-${KOTLIN_VER}.zip`);
  await download(
    `https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VER}/kotlin-compiler-${KOTLIN_VER}.zip`,
    archive,
  );
  const unpack = join(root, "_kotlin-unpack");
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  await extract(archive, unpack);
  const inner = existsSync(join(unpack, "kotlinc"))
    ? join(unpack, "kotlinc")
    : await onlyChildDir(unpack);
  if (!inner) throw new Error("kotlinc extract failed");
  await rm(dest, { recursive: true, force: true }).catch(() => {});
  await rename(inner, dest).catch(async () => {
    await cp(inner, dest, { recursive: true });
  });
  await rm(unpack, { recursive: true, force: true }).catch(() => {});
  if (!existsSync(bin)) throw new Error("kotlinc extract failed");
  markExec(bin);
  pushLog("kotlinc installed");
}

async function ensureAndroidSdk(root: string, javaHome: string): Promise<void> {
  const sdk = join(root, "android-sdk");
  const sdkmanager = join(
    sdk,
    "cmdline-tools",
    "latest",
    "bin",
    process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager",
  );
  await mkdir(sdk, { recursive: true });
  if (!existsSync(sdkmanager)) {
    pushLog("Fetching Android command-line tools");
    const zipPlat = plat() === "mac" ? "mac" : plat() === "windows" ? "win" : "linux";
    const zipName = `commandlinetools-${zipPlat}-${CMDLINE_VER}_latest.zip`;
    const archive = join(tmpdir(), zipName);
    await download(`https://dl.google.com/android/repository/${zipName}`, archive);
    const unpack = join(root, "_sdk-unpack");
    await rm(unpack, { recursive: true, force: true }).catch(() => {});
    await extract(archive, unpack);
    const latest = join(sdk, "cmdline-tools", "latest");
    await mkdir(join(sdk, "cmdline-tools"), { recursive: true });
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
  const needPlat = !existsSync(join(sdk, "platforms", "android-35"));
  const needBuild = !existsSync(join(sdk, "build-tools", "35.0.0"));
  if (!needPlat && !needBuild) {
    pushLog("Android SDK 35 already present");
    return;
  }
  pushLog("Accepting Android SDK licenses");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(sdkmanager, ["--sdk_root=" + sdk, "--licenses"], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    child.stdin?.write("y\n".repeat(80));
    child.stdin?.end();
    child.on("error", reject);
    child.on("close", () => resolve());
  });
  pushLog("Installing Android SDK 35 (platforms + build-tools)");
  await run(
    sdkmanager,
    ["--sdk_root=" + sdk, "platforms;android-35", "build-tools;35.0.0", "platform-tools"],
    { env, timeoutMs: 300_000 },
  );
  if (!existsSync(join(sdk, "platforms")) || !existsSync(join(sdk, "build-tools"))) {
    throw new Error("Android SDK install did not produce platforms/build-tools");
  }
  pushLog("Android SDK 35 installed");
}

export function getInstallStatus(): InstallStatus {
  const cap = installCapability();
  return {
    phase: job.phase,
    logs: job.logs.slice(-80),
    error: job.error,
    toolchain: describeToolchain(),
    canInstall: cap.canInstall,
    installBlocked: cap.reason,
  };
}

async function runInstall(): Promise<void> {
  const root = toolchainRoot();
  mkdirSync(root, { recursive: true });
  pushLog("Checking this machine for JDK, Gradle, kotlinc, Android SDK");
  const javaHome = await ensureJdk(root);
  await ensureGradle(root);
  await ensureKotlinc(root);
  await ensureAndroidSdk(root, javaHome);
  const done = describeToolchain();
  if (!done.java || !done.androidSdk) {
    throw new Error(
      `Install finished but still missing: ${(done.missing ?? []).join(", ") || "toolchain"}`,
    );
  }
  pushLog(`Ready · ${done.labels.join(" · ")}`);
}

export function startInstall(): InstallStatus {
  const cap = installCapability();
  if (!cap.canInstall) {
    job.phase = "failed";
    job.error = cap.reason;
    pushLog(cap.reason ?? "Cannot install here");
    return getInstallStatus();
  }
  if (job.phase === "running") return getInstallStatus();
  job.phase = "running";
  job.error = undefined;
  job.logs = [];
  pushLog("Starting toolchain download (skips anything already on disk)");
  void runInstall()
    .then(() => {
      job.phase = "success";
    })
    .catch((err) => {
      job.phase = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      pushLog(job.error);
    });
  return getInstallStatus();
}
