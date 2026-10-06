import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CompileInput, CompileResult, CompileDiagnostic } from "./compile";

export function toolchainRoot(): string {
  return process.env.XIDE_TOOLCHAIN || join(process.cwd(), "toolchains");
}

function binExt(): string {
  return process.platform === "win32" ? ".exe" : "";
}

function androidSdkReady(home: string): boolean {
  return existsSync(join(home, "platforms")) && existsSync(join(home, "build-tools"));
}

export function installCapability(): { canInstall: boolean; reason?: string } {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return {
      canInstall: false,
      reason:
        "This web host cannot store the Android SDK. It is several gigabytes and does not persist on a typical web deploy. Run xIDE on a computer you keep, then tap Download SDK.",
    };
  }
  try {
    const root = toolchainRoot();
    mkdirSync(root, { recursive: true });
    const probe = join(root, ".xide-write-test");
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    return { canInstall: true };
  } catch {
    return {
      canInstall: false,
      reason: "This machine cannot write a toolchain folder, so the SDK cannot be downloaded here.",
    };
  }
}

export type ResolvedToolchain = {
  root: string;
  javaHome: string;
  java: string;
  javac: string;
  jar: string;
  kotlinc: string;
  gradle: string;
  androidHome: string;
  javaOk: boolean;
  kotlincOk: boolean;
  gradleOk: boolean;
  androidSdkOk: boolean;
};

export function resolveToolchain(): ResolvedToolchain {
  const root = toolchainRoot();
  const x = binExt();
  const javaHome =
    [
      process.env.JAVA_HOME,
      join(root, "jdk"),
      "/usr/lib/jvm/java-17-openjdk-amd64",
      "/usr/lib/jvm/java-17-openjdk",
    ].find((h) => h && existsSync(join(h, "bin", `java${x}`))) || "";
  const kotlinc =
    [
      join(root, "kotlin", "bin", process.platform === "win32" ? "kotlinc.bat" : "kotlinc"),
      join(root, "kotlinc", "bin", process.platform === "win32" ? "kotlinc.bat" : "kotlinc"),
    ].find((p) => existsSync(p)) || "";
  const gradle =
    [
      join(root, "gradle-8.12.1", "bin", process.platform === "win32" ? "gradle.bat" : "gradle"),
      join(root, "gradle", "bin", process.platform === "win32" ? "gradle.bat" : "gradle"),
    ].find((p) => existsSync(p)) || "";
  const androidHome =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(root, "android-sdk");
  const java = javaHome ? join(javaHome, "bin", `java${x}`) : "";
  const javac = javaHome ? join(javaHome, "bin", `javac${x}`) : "";
  const jar = javaHome ? join(javaHome, "bin", `jar${x}`) : "";
  return {
    root,
    javaHome,
    java,
    javac,
    jar,
    kotlinc,
    gradle,
    androidHome,
    javaOk: Boolean(javaHome && existsSync(java) && existsSync(javac)),
    kotlincOk: Boolean(kotlinc),
    gradleOk: Boolean(gradle),
    androidSdkOk: androidSdkReady(androidHome),
  };
}

export type ToolchainStatus = {
  java: boolean;
  kotlinc: boolean;
  gradle: boolean;
  androidSdk: boolean;
  labels: string[];
  canInstall: boolean;
  installBlocked?: string;
  missing: string[];
};

export function describeToolchain(): ToolchainStatus {
  const tc = resolveToolchain();
  const labels: string[] = [];
  const missing: string[] = [];
  if (tc.javaOk) labels.push("OpenJDK 17");
  else missing.push("OpenJDK 17");
  if (tc.kotlincOk) labels.push("kotlinc-jvm 2.1.10");
  else missing.push("kotlinc");
  if (tc.gradleOk) labels.push("Gradle 8.12.1");
  else missing.push("Gradle");
  if (tc.androidSdkOk) labels.push("Android SDK 35");
  else missing.push("Android SDK 35");
  const cap = installCapability();
  return {
    java: tc.javaOk,
    kotlinc: tc.kotlincOk,
    gradle: tc.gradleOk,
    androidSdk: tc.androidSdkOk,
    labels,
    missing,
    canInstall: cap.canInstall,
    installBlocked: cap.reason,
  };
}

function gradleEnv(): NodeJS.ProcessEnv {
  const tc = resolveToolchain();
  return {
    JAVA_HOME: tc.javaHome,
    GRADLE_USER_HOME: join(tc.root, "gradle-home"),
    ANDROID_HOME: tc.androidHome,
    ANDROID_SDK_ROOT: tc.androidHome,
  };
}

function bytesLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ANDROID_IMPORT =
  /^\s*import\s+(androidx?|androidx\.compose|com\.google\.android)\b/m;
const AGP_PLUGIN = /id\(\s*"com\.android\.(application|library)"\s*\)/;

function execFile(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const javaHome = opts.env?.JAVA_HOME || resolveToolchain().javaHome;
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: { ...process.env, JAVA_HOME: javaHome, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const take = (prev: string, chunk: Buffer) => {
      const next = prev + chunk.toString("utf8");
      return next.length > 240_000 ? next.slice(-120_000) : next;
    };
    child.stdout?.on("data", (d: Buffer) => {
      stdout = take(stdout, d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr = take(stderr, d);
    });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 90_000);
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

function cleanLog(s: string): string {
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

function safeRel(p: string): string | null {
  const n = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("..") || n.startsWith("/")) return null;
  return n;
}

function parseDiagnostics(text: string, root: string): CompileDiagnostic[] {
  const out: CompileDiagnostic[] = [];
  const re = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|e|w):\s*(.+)$/gim;
  let m: RegExpExecArray | null;
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

function hasMainKotlin(content: string): boolean {
  return /^\s*fun\s+main\s*\(/m.test(content);
}

function hasMainJava(content: string): boolean {
  return /public\s+static\s+void\s+main\s*\(/.test(content);
}

function kotlinMainClass(path: string, content: string): string {
  const pkg = /package\s+([\w.]+)/.exec(content)?.[1];
  const base = (path.split("/").pop() ?? "Main").replace(/\.kt$/, "");
  const cls = `${base}Kt`;
  return pkg ? `${pkg}.${cls}` : cls;
}

function javaMainClass(path: string, content: string): string {
  const pkg = /package\s+([\w.]+)\s*;/.exec(content)?.[1];
  const base = (path.split("/").pop() ?? "Main").replace(/\.java$/, "");
  return pkg ? `${pkg}.${base}` : base;
}

function isAgpProject(files: Record<string, string>): boolean {
  return Object.entries(files).some(
    ([p, c]) => /(^|\/)build\.gradle(\.kts)?$/.test(p) && AGP_PLUGIN.test(c),
  );
}

function usesAndroidApis(content: string): boolean {
  return ANDROID_IMPORT.test(content);
}

async function findJars(dir: string): Promise<string[]> {
  return findByExt(dir, (name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
}

async function findApks(dir: string): Promise<string[]> {
  const all = await findByExt(dir, (name) => name.endsWith(".apk"));
  const signed = all.filter((p) => !p.endsWith("-unsigned.apk"));
  return signed.length ? signed : all;
}

async function findByExt(dir: string, pred: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "toolchains" || e.name === ".gradle") continue;
      out.push(...(await findByExt(p, pred)));
    } else if (pred(e.name)) {
      out.push(p);
    }
  }
  return out;
}

export async function compileProject(input: CompileInput): Promise<CompileResult> {
  const logs: CompileResult["logs"] = [];
  const toolchain: string[] = [];
  const push = (level: CompileResult["logs"][number]["level"], text: string) => {
    const t = text.trim();
    if (t) logs.push({ level, text: t });
  };

  const tc = resolveToolchain();
  const { java: JAVA, javac: JAVAC, jar: JAR, kotlinc: KOTLINC, gradle: GRADLE, androidHome: ANDROID_HOME } = tc;
  const javaOk = tc.javaOk;
  const sdkOk = tc.androidSdkOk;

  if (javaOk) toolchain.push("OpenJDK 17");
  if (tc.kotlincOk) toolchain.push("kotlinc-jvm 2.1.10");
  if (tc.gradleOk) toolchain.push("Gradle 8.12.1");
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
    const cap = installCapability();
    return {
      ok: false,
      logs: [
        ...logs,
        {
          level: "error",
          text: cap.canInstall
            ? "No JDK on this machine. Open Settings and tap Download SDK."
            : "No JDK on this host. Kotlin/Java compile needs OpenJDK 17.",
        },
      ],
      diagnostics: [],
      artifacts: [],
      stdout: [],
      stderr: [],
      toolchain,
    };
  }

  if (agp && !sdkOk) {
    const cap = installCapability();
    const hint = cap.canInstall
      ? " Open Settings and tap Download SDK — it is not bundled; this machine fetches it when you choose."
      : cap.reason
        ? ` ${cap.reason}`
        : "";
    return {
      ok: true,
      skipped:
        "Android Gradle Plugin / Compose need the Android SDK, which is not on this host. Source zip is the artifact.",
      logs: [
        ...logs,
        {
          level: "warn",
          text: `Skipped APK assemble — no Android SDK.${hint}`,
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
        timeoutMs: 240_000,
        env: gradleEnv(),
      });
      const combined = cleanLog(`${g.stdout}\n${g.stderr}`);
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
      const diagnostics = parseDiagnostics(combined, root);
      const artifacts: CompileResult["artifacts"] = [];
      const apks = await findApks(root);
      for (const ap of apks.slice(0, 2)) {
        const buf = await readFile(ap);
        if (buf.byteLength > 30_000_000) {
          push("warn", `${ap.split("/").pop()} is ${bytesLabel(buf.byteLength)} — too large to attach`);
          continue;
        }
        artifacts.push({
          name: ap.split("/").pop() ?? "app-debug.apk",
          mime: "application/vnd.android.package-archive",
          base64: buf.toString("base64"),
        });
        push("ok", `Wrote ${ap.split("/").pop()} (${bytesLabel(buf.byteLength)})`);
      }
      const ok = g.code === 0 && artifacts.length > 0;
      if (g.code === 0 && !artifacts.length) {
        push("error", "Gradle succeeded but no APK was produced");
      }
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
        timeoutMs: 120_000,
        env: gradleEnv(),
      });
      const combined = cleanLog(`${g.stdout}\n${g.stderr}`);
      for (const line of combined.split("\n")) {
        if (!line.trim()) continue;
        if (/^FAILURE|error:/i.test(line) || line.includes("FAILED")) push("error", line);
        else if (/^> Task /.test(line) || /^Download /.test(line)) push("info", line);
        else if (line.startsWith("e: ") || line.startsWith("w: ")) push(line.startsWith("w") ? "warn" : "error", line);
        else if (/BUILD SUCCESSFUL/.test(line)) push("ok", line);
        else if (line.length < 200 && !/^Welcome|^Here are|^For more details|^----/.test(line) && !line.includes("https://"))
          push("info", line);
      }
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
      const artifacts: CompileResult["artifacts"] = [];
      const jars = await findJars(join(root, "build"));
      for (const jp of jars.slice(0, 3)) {
        const buf = await readFile(jp);
        if (buf.byteLength > 6_000_000) continue;
        artifacts.push({
          name: jp.split("/").pop() ?? "app.jar",
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
          logs: [
            ...logs,
            {
              level: "error",
              text: installCapability().canInstall
                ? "kotlinc is not installed. Open Settings and tap Download SDK."
                : "kotlinc not installed on this host",
            },
          ],
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
        for (const line of cleanLog(combined).split("\n").filter(Boolean).slice(0, 40)) {
          push("error", line);
        }
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
      const artifacts: CompileResult["artifacts"] = [];
      if (buf.byteLength <= 8_000_000) {
        artifacts.push({
          name: jarPath.split("/").pop() ?? "app.jar",
          mime: "application/java-archive",
          base64: buf.toString("base64"),
        });
      }
      push("ok", `Wrote ${artifacts[0]?.name ?? "jar"} (${buf.byteLength} bytes)`);

      let stdout: string[] = [];
      let stderr: string[] = [];
      if (input.run) {
        const main =
          compileKt.find(([, c]) => hasMainKotlin(c)) ??
          compileJava.find(([, c]) => hasMainJava(c));
        if (main) {
          const [path, content] = main;
          const cls = path.endsWith(".kt")
            ? kotlinMainClass(path, content)
            : javaMainClass(path, content);
          push("info", `java -jar (${cls})`);
          const run = await execFile(JAVA, ["-jar", jarPath], {
            cwd: root,
            timeoutMs: 8_000,
          });
          stdout = run.stdout.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l || i < a.length - 1);
          stderr = run.stderr.split("\n").map((l) => l.trimEnd()).filter(Boolean);
          for (const t of stdout.filter(Boolean).slice(0, 40)) push("ok", t);
          for (const t of stderr.slice(0, 20)) push("error", t);
          if (run.code !== 0 && !stderr.length) push("error", `java exited ${run.code}`);
          return {
            ok: run.code === 0,
            logs,
            diagnostics,
            artifacts,
            stdout: stdout.filter(Boolean),
            stderr,
            toolchain,
          };
        }
        push("warn", "No fun main / public static void main — compiled, not run");
      }
      return {
        ok: true,
        logs,
        diagnostics,
        artifacts,
        stdout,
        stderr,
        toolchain,
      };
    }

    if (javaPaths.length) {
      push("info", `javac ${javaPaths.length} file(s)`);
      const r = await execFile(JAVAC, ["-d", outDir, ...javaPaths], {
        cwd: root,
        timeoutMs: 30_000,
      });
      combined += `${r.stdout}\n${r.stderr}`;
      const diagnostics = parseDiagnostics(combined, root);
      if (r.code !== 0) {
        for (const line of cleanLog(combined).split("\n").filter(Boolean).slice(0, 40)) {
          push("error", line);
        }
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
      const artifacts: CompileResult["artifacts"] = [];
      if (existsSync(jarPath)) {
        const buf = await readFile(jarPath);
        if (buf.byteLength <= 6_000_000) {
          artifacts.push({
            name: jarName,
            mime: "application/java-archive",
            base64: buf.toString("base64"),
          });
          push("ok", `Wrote ${jarName} (${buf.byteLength} bytes)`);
        }
      }
      let stdout: string[] = [];
      let stderr: string[] = [];
      if (input.run && cls) {
        push("info", `java ${cls}`);
        const run = await execFile(JAVA, ["-cp", outDir, cls], {
          cwd: root,
          timeoutMs: 8_000,
        });
        stdout = run.stdout.split("\n").map((l) => l.trimEnd()).filter(Boolean);
        stderr = run.stderr.split("\n").map((l) => l.trimEnd()).filter(Boolean);
        for (const t of stdout.slice(0, 40)) push("ok", t);
        for (const t of stderr.slice(0, 20)) push("error", t);
        return {
          ok: run.code === 0,
          logs,
          diagnostics,
          artifacts,
          stdout,
          stderr,
          toolchain,
        };
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
