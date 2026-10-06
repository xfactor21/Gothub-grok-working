import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.XIDE_TOOLCHAIN || join(HERE, "toolchains");
const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";

function loadSaved() {
  const p = join(ROOT, "env.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

const saved = loadSaved();
const JAVA_HOME =
  process.env.JAVA_HOME ||
  saved.JAVA_HOME ||
  (existsSync(join(ROOT, "jdk", "bin", `java${EXE}`)) ? join(ROOT, "jdk") : "") ||
  "/usr/lib/jvm/java-17-openjdk-amd64";

function findBin(candidates) {
  return candidates.find((p) => p && existsSync(p));
}

const KOTLINC = findBin([
  process.env.KOTLINC,
  saved.KOTLINC,
  join(ROOT, "kotlinc", "bin", WIN ? "kotlinc.bat" : "kotlinc"),
  join(ROOT, "kotlin", "bin", WIN ? "kotlinc.bat" : "kotlinc"),
]);
const GRADLE = findBin([
  process.env.GRADLE,
  saved.GRADLE,
  join(ROOT, "gradle-8.12.1", "bin", WIN ? "gradle.bat" : "gradle"),
  join(ROOT, "gradle", "bin", WIN ? "gradle.bat" : "gradle"),
]);
const JAVAC = join(JAVA_HOME, "bin", `javac${EXE}`);
const JAVA = join(JAVA_HOME, "bin", `java${EXE}`);
const JAR = join(JAVA_HOME, "bin", `jar${EXE}`);
const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  saved.ANDROID_HOME ||
  join(ROOT, "android-sdk");

function androidSdkReady(home) {
  return existsSync(join(home, "platforms")) && existsSync(join(home, "build-tools"));
}

export function describeToolchain() {
  const java = existsSync(JAVA) && existsSync(JAVAC);
  const kotlinc = Boolean(KOTLINC);
  const gradle = Boolean(GRADLE);
  const androidSdk = androidSdkReady(ANDROID_HOME);
  const labels = [];
  if (java) labels.push("OpenJDK 17");
  if (kotlinc) labels.push("kotlinc-jvm 2.1.10");
  if (gradle) labels.push("Gradle 8.12.1");
  if (androidSdk) labels.push("Android SDK 35");
  return {
    java,
    kotlinc,
    gradle,
    androidSdk,
    labels,
    version: "1.0.0",
    host: "xide-compile-host",
  };
}

function gradleEnv() {
  return {
    JAVA_HOME,
    GRADLE_USER_HOME: saved.GRADLE_USER_HOME || join(ROOT, "gradle-home"),
    ANDROID_HOME,
    ANDROID_SDK_ROOT: ANDROID_HOME,
  };
}

function bytesLabel(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ANDROID_IMPORT =
  /^\s*import\s+(androidx?|androidx\.compose|com\.google\.android)\b/m;
const AGP_PLUGIN = /id\(\s*"com\.android\.(application|library)"\s*\)/;

function execFile(file, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: { ...process.env, JAVA_HOME, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: WIN && /\.(bat|cmd)$/i.test(file),
    });
    let stdout = "";
    let stderr = "";
    const take = (prev, chunk) => {
      const next = prev + chunk.toString("utf8");
      return next.length > 240_000 ? next.slice(-120_000) : next;
    };
    child.stdout?.on("data", (d) => {
      stdout = take(stdout, d);
    });
    child.stderr?.on("data", (d) => {
      stderr = take(stderr, d);
    });
    const t = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 90_000);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` });
    });
  });
}

function cleanLog(s) {
  return s
    .split("\n")
    .filter(
      (line) =>
        !line.includes("MessageIOException") &&
        !line.includes("Unable to receive command") &&
        !line.includes("Discarding connection") &&
        !line.includes("Unexpected type tag") &&
        !line.includes("SocketConnection") &&
        !line.includes("SynchronizedDispatchConnection") &&
        !line.includes("DefaultDaemonConnection") &&
        !line.includes("ExecutorPolicy") &&
        !line.includes("AbstractManagedExecutor") &&
        !line.includes("ThreadPoolExecutor") &&
        !/^\s*at org\.gradle\./.test(line) &&
        !/^\s*at java\.base\//.test(line) &&
        !line.includes("Caused by: java.lang.IllegalArgumentException") &&
        !line.includes("To honour the JVM settings") &&
        !line.includes("Daemon will be stopped") &&
        !line.includes("please refer to https://docs.gradle.org") &&
        line.trim() !== "... 7 more" &&
        line.trim() !== "\t... 7 more" &&
        !/^\s*\.\.\. \d+ more/.test(line),
    )
    .join("\n")
    .trim();
}

function safeRel(p) {
  const n = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("..") || n.startsWith("/")) return null;
  return n;
}

function parseDiagnostics(text, root) {
  const out = [];
  const re = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|e|w):\s*(.+)$/gim;
  let m;
  while ((m = re.exec(text))) {
    let file = (m[1] ?? "").replace(/\\/g, "/");
    if (file.startsWith(root)) file = file.slice(root.length).replace(/^\/+/, "");
    out.push({
      file,
      line: Number(m[2]) || 1,
      col: Number(m[3]) || 1,
      severity: m[4]?.toLowerCase().startsWith("w") ? "warning" : "error",
      message: (m[5] ?? "").trim(),
    });
  }
  return out;
}

function hasMainKotlin(content) {
  return /^\s*fun\s+main\s*\(/m.test(content);
}
function hasMainJava(content) {
  return /public\s+static\s+void\s+main\s*\(/.test(content);
}
function kotlinMainClass(path, content) {
  const pkg = /package\s+([\w.]+)/.exec(content)?.[1];
  const base = (path.split("/").pop() ?? "Main").replace(/\.kt$/, "");
  const cls = `${base}Kt`;
  return pkg ? `${pkg}.${cls}` : cls;
}
function javaMainClass(path, content) {
  const pkg = /package\s+([\w.]+)\s*;/.exec(content)?.[1];
  const base = (path.split("/").pop() ?? "Main").replace(/\.java$/, "");
  return pkg ? `${pkg}.${base}` : base;
}
function isAgpProject(files) {
  return Object.entries(files).some(
    ([p, c]) => /(^|\/)build\.gradle(\.kts)?$/.test(p) && AGP_PLUGIN.test(c),
  );
}
function usesAndroidApis(content) {
  return ANDROID_IMPORT.test(content);
}

async function findByExt(dir, pred) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "toolchains" || e.name === ".gradle") continue;
      out.push(...(await findByExt(p, pred)));
    } else if (pred(e.name)) out.push(p);
  }
  return out;
}
async function findJars(dir) {
  return findByExt(dir, (name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
}
async function findApks(dir) {
  const all = await findByExt(dir, (name) => name.endsWith(".apk"));
  const signed = all.filter((p) => !p.endsWith("-unsigned.apk"));
  return signed.length ? signed : all;
}

function pushGradleLog(push, combined) {
  for (const line of combined.split("\n")) {
    if (!line.trim()) continue;
    if (/^FAILURE|error:/i.test(line) || line.includes("FAILED")) push("error", line);
    else if (/^> Task /.test(line) || /^Download /.test(line)) push("info", line);
    else if (line.startsWith("e: ") || line.startsWith("w: "))
      push(line.startsWith("w") ? "warn" : "error", line);
    else if (/BUILD SUCCESSFUL/.test(line)) push("ok", line);
    else if (
      line.length < 200 &&
      !/^Welcome|^Here are|^For more details|^----/.test(line) &&
      !line.includes("https://")
    )
      push("info", line);
  }
}

export async function compileProject(input) {
  const logs = [];
  const toolchain = [];
  const push = (level, text) => {
    const t = text.trim();
    if (t) logs.push({ level, text: t });
  };

  const javaOk = existsSync(JAVA) && existsSync(JAVAC);
  if (javaOk) toolchain.push("OpenJDK 17");
  if (KOTLINC) toolchain.push("kotlinc-jvm 2.1.10");
  if (GRADLE) toolchain.push("Gradle 8.12.1");
  const sdkOk = androidSdkReady(ANDROID_HOME);
  if (sdkOk) toolchain.push("Android SDK 35");
  if (toolchain.length) push("info", `Toolchain · ${toolchain.join(" · ")}`);

  const entries = Object.entries(input.files).slice(0, 120);
  const ktAll = entries.filter(([p]) => p.endsWith(".kt"));
  const javaAll = entries.filter(([p]) => p.endsWith(".java"));
  const agp = isAgpProject(input.files) || input.templateId === "android-compose";
  const ktJvm = ktAll.filter(([, c]) => !usesAndroidApis(c));

  if (!ktAll.length && !javaAll.length) {
    return {
      ok: true,
      skipped: "No Kotlin or Java sources to compile",
      logs,
      diagnostics: [],
      artifacts: [],
      stdout: [],
      stderr: [],
      toolchain,
    };
  }

  if (!javaOk) {
    return {
      ok: false,
      logs: [
        ...logs,
        { level: "error", text: "No JDK on this host. Kotlin/Java compile needs OpenJDK 17." },
      ],
      diagnostics: [],
      artifacts: [],
      stdout: [],
      stderr: [],
      toolchain,
    };
  }

  if (agp && !sdkOk) {
    return {
      ok: true,
      skipped:
        "Android Gradle Plugin / Compose need the Android SDK, which is not on this host. Source zip is the artifact.",
      logs: [
        ...logs,
        {
          level: "warn",
          text: "Skipped APK assemble — no Android SDK. Kotlin sources were not compiled against android.jar.",
        },
      ],
      diagnostics: [],
      artifacts: [],
      stdout: [],
      stderr: [],
      toolchain,
    };
  }

  const root = await mkdtemp(join(tmpdir(), "xide-build-"));
  try {
    for (const [raw, content] of entries) {
      const rel = safeRel(raw);
      if (!rel) continue;
      const dest = join(root, rel);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content, "utf8");
    }

    if (agp && sdkOk && GRADLE) {
      await writeFile(
        join(root, "local.properties"),
        `sdk.dir=${ANDROID_HOME.replace(/\\/g, "/")}\n`,
        "utf8",
      );
      const task =
        existsSync(join(root, "app/build.gradle.kts")) || existsSync(join(root, "app/build.gradle"))
          ? ":app:assembleDebug"
          : "assembleDebug";
      push("info", `gradle ${task} --no-daemon`);
      const g = await execFile(GRADLE, ["--no-daemon", "--console=plain", task], {
        cwd: root,
        timeoutMs: 600_000,
        env: gradleEnv(),
      });
      const combined = cleanLog(`${g.stdout}\n${g.stderr}`);
      pushGradleLog(push, combined);
      const diagnostics = parseDiagnostics(combined, root);
      const artifacts = [];
      const apks = await findApks(root);
      for (const ap of apks.slice(0, 2)) {
        const buf = await readFile(ap);
        if (buf.byteLength > 30_000_000) {
          push("warn", `${ap.split(/[/\\]/).pop()} is ${bytesLabel(buf.byteLength)} — too large to attach`);
          continue;
        }
        artifacts.push({
          name: ap.split(/[/\\]/).pop() ?? "app-debug.apk",
          mime: "application/vnd.android.package-archive",
          base64: buf.toString("base64"),
        });
        push("ok", `Wrote ${ap.split(/[/\\]/).pop()} (${bytesLabel(buf.byteLength)})`);
      }
      const ok = g.code === 0 && artifacts.length > 0;
      if (g.code === 0 && !artifacts.length) push("error", "Gradle succeeded but no APK was produced");
      if (ok) push("ok", "Gradle finished");
      else if (g.code !== 0) push("error", `Gradle exited ${g.code}`);
      return {
        ok,
        logs,
        diagnostics,
        artifacts,
        stdout: [],
        stderr: ok ? [] : cleanLog(g.stderr).split("\n").filter(Boolean).slice(-30),
        toolchain,
      };
    }

    const compileKt = ktJvm.length ? ktJvm : agp ? [] : ktAll;
    const compileJava = javaAll;
    const wantGradle =
      Boolean(GRADLE) &&
      !agp &&
      (input.templateId === "kotlin-jvm" ||
        input.templateId === "java" ||
        existsSync(join(root, "build.gradle.kts")) ||
        existsSync(join(root, "build.gradle")));

    if (wantGradle && GRADLE) {
      if (!existsSync(join(root, "settings.gradle.kts")) && !existsSync(join(root, "settings.gradle"))) {
        await writeFile(
          join(root, "settings.gradle.kts"),
          `pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }\nrootProject.name = ${JSON.stringify(input.projectName.replace(/[^\w.-]+/g, "-") || "app")}\n`,
          "utf8",
        );
      }
      push("info", `gradle jar ${input.run ? "run" : ""} --no-daemon`.replace(/\s+/g, " ").trim());
      const args = ["--no-daemon", "--console=plain", "jar"];
      if (input.run) args.push("run");
      const g = await execFile(GRADLE, args, {
        cwd: root,
        timeoutMs: 180_000,
        env: gradleEnv(),
      });
      const combined = cleanLog(`${g.stdout}\n${g.stderr}`);
      pushGradleLog(push, combined);
      const diagnostics = parseDiagnostics(combined, root);
      const stdoutLines = cleanLog(g.stdout)
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(
          (l) =>
            l &&
            !l.startsWith("> Task") &&
            !l.startsWith("BUILD ") &&
            !l.includes("Daemon") &&
            !l.startsWith("Welcome") &&
            !l.startsWith("2 actionable") &&
            !l.startsWith("1 actionable"),
        );
      const artifacts = [];
      const jars = await findJars(join(root, "build"));
      for (const jp of jars.slice(0, 3)) {
        const buf = await readFile(jp);
        if (buf.byteLength > 6_000_000) continue;
        artifacts.push({
          name: jp.split(/[/\\]/).pop() ?? "app.jar",
          mime: "application/java-archive",
          base64: buf.toString("base64"),
        });
      }
      const ok = g.code === 0;
      if (ok) push("ok", "Gradle finished");
      else push("error", `Gradle exited ${g.code}`);
      return {
        ok,
        logs,
        diagnostics,
        artifacts,
        stdout: stdoutLines.slice(-40),
        stderr: ok ? [] : cleanLog(g.stderr).split("\n").filter(Boolean).slice(-30),
        toolchain,
      };
    }

    const ktPaths = compileKt.map(([p]) => join(root, p)).filter((p) => existsSync(p));
    const javaPaths = compileJava.map(([p]) => join(root, p)).filter((p) => existsSync(p));
    const outDir = join(root, "out");
    await mkdir(outDir, { recursive: true });
    let combined = "";

    if (ktPaths.length) {
      if (!KOTLINC) {
        return {
          ok: false,
          logs: [...logs, { level: "error", text: "kotlinc not installed on this host" }],
          diagnostics: [],
          artifacts: [],
          stdout: [],
          stderr: [],
          toolchain,
        };
      }
      const jarPath = join(root, `${input.projectName.replace(/[^\w.-]+/g, "-") || "app"}.jar`);
      const args = [...ktPaths, ...javaPaths, "-include-runtime", "-d", jarPath];
      push("info", `kotlinc ${ktPaths.length} kotlin · ${javaPaths.length} java → jar`);
      const r = await execFile(KOTLINC, args, { cwd: root, timeoutMs: 45_000 });
      combined += `${r.stdout}\n${r.stderr}`;
      const diagnostics = parseDiagnostics(combined, root);
      if (r.code !== 0) {
        for (const line of cleanLog(combined).split("\n").filter(Boolean).slice(0, 40)) push("error", line);
        return {
          ok: false,
          logs,
          diagnostics,
          artifacts: [],
          stdout: [],
          stderr: cleanLog(r.stderr).split("\n").filter(Boolean).slice(-20),
          toolchain,
        };
      }
      const buf = await readFile(jarPath);
      const artifacts = [];
      if (buf.byteLength <= 8_000_000) {
        artifacts.push({
          name: jarPath.split(/[/\\]/).pop() ?? "app.jar",
          mime: "application/java-archive",
          base64: buf.toString("base64"),
        });
      }
      push("ok", `Wrote ${artifacts[0]?.name ?? "jar"} (${buf.byteLength} bytes)`);
      let stdout = [];
      let stderr = [];
      if (input.run) {
        const main =
          compileKt.find(([, c]) => hasMainKotlin(c)) ?? compileJava.find(([, c]) => hasMainJava(c));
        if (main) {
          const [path, content] = main;
          const cls = path.endsWith(".kt") ? kotlinMainClass(path, content) : javaMainClass(path, content);
          push("info", `java -jar (${cls})`);
          const run = await execFile(JAVA, ["-jar", jarPath], { cwd: root, timeoutMs: 8_000 });
          stdout = run.stdout.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l || i < a.length - 1);
          stderr = run.stderr.split("\n").map((l) => l.trimEnd()).filter(Boolean);
          for (const t of stdout.filter(Boolean).slice(0, 40)) push("ok", t);
          for (const t of stderr.slice(0, 20)) push("error", t);
          if (run.code !== 0 && !stderr.length) push("error", `java exited ${run.code}`);
          return { ok: run.code === 0, logs, diagnostics, artifacts, stdout: stdout.filter(Boolean), stderr, toolchain };
        }
        push("warn", "No fun main / public static void main — compiled, not run");
      }
      return { ok: true, logs, diagnostics, artifacts, stdout, stderr, toolchain };
    }

    if (javaPaths.length) {
      push("info", `javac ${javaPaths.length} file(s)`);
      const r = await execFile(JAVAC, ["-d", outDir, ...javaPaths], { cwd: root, timeoutMs: 30_000 });
      combined += `${r.stdout}\n${r.stderr}`;
      const diagnostics = parseDiagnostics(combined, root);
      if (r.code !== 0) {
        for (const line of cleanLog(combined).split("\n").filter(Boolean).slice(0, 40)) push("error", line);
        return {
          ok: false,
          logs,
          diagnostics,
          artifacts: [],
          stdout: [],
          stderr: cleanLog(r.stderr).split("\n").filter(Boolean),
          toolchain,
        };
      }
      const main = compileJava.find(([, c]) => hasMainJava(c));
      const cls = main ? javaMainClass(main[0], main[1]) : null;
      const jarName = `${input.projectName.replace(/[^\w.-]+/g, "-") || "app"}.jar`;
      const jarPath = join(root, jarName);
      if (cls && existsSync(JAR)) {
        const manifest = join(root, "MANIFEST.MF");
        await writeFile(manifest, `Manifest-Version: 1.0\nMain-Class: ${cls}\n`, "utf8");
        await execFile(JAR, ["cfe", jarPath, cls, "-C", outDir, "."], { cwd: root, timeoutMs: 15_000 });
      }
      const artifacts = [];
      if (existsSync(jarPath)) {
        const buf = await readFile(jarPath);
        if (buf.byteLength <= 6_000_000) {
          artifacts.push({ name: jarName, mime: "application/java-archive", base64: buf.toString("base64") });
          push("ok", `Wrote ${jarName} (${buf.byteLength} bytes)`);
        }
      }
      let stdout = [];
      let stderr = [];
      if (input.run && cls) {
        push("info", `java ${cls}`);
        const run = await execFile(JAVA, ["-cp", outDir, cls], { cwd: root, timeoutMs: 8_000 });
        stdout = run.stdout.split("\n").map((l) => l.trimEnd()).filter(Boolean);
        stderr = run.stderr.split("\n").map((l) => l.trimEnd()).filter(Boolean);
        for (const t of stdout.slice(0, 40)) push("ok", t);
        for (const t of stderr.slice(0, 20)) push("error", t);
        return { ok: run.code === 0, logs, diagnostics, artifacts, stdout, stderr, toolchain };
      }
      push("ok", "javac finished");
      return { ok: true, logs, diagnostics, artifacts, stdout, stderr, toolchain };
    }

    return {
      ok: true,
      skipped: "Nothing to compile",
      logs,
      diagnostics: [],
      artifacts: [],
      stdout: [],
      stderr: [],
      toolchain,
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
