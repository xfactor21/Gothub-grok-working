import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { analyzeProject } from "./diagnostics";
import { indexProject } from "./indexer";
import { collectHtmlPreview, formatBytes, projectSize, runJsModule, abortJsRun } from "./runtime";
import { filesForTemplate, foldersFor, languageForPath } from "./templates";
import { zipFiles, safeZipName, projectFilesFromZip, describeZipSkips } from "./zip";
import { compileProjectFiles } from "./compile";
import type {
  Artifact,
  BuildLogLine,
  BuildPhase,
  ChatMessage,
  Diagnostic,
  NodePhase,
  Project,
  Settings,
  SymbolHit,
  TemplateId,
  TermLine,
  View,
  XeroPhase,
} from "./types";

function nid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): number {
  return Date.now();
}


export interface XideState {
  hydrated: boolean;
  view: View;
  projects: Project[];
  activeProjectId: string | null;
  openTabs: string[];
  activeFile: string | null;
  dirty: Record<string, boolean>;
  diagnostics: Diagnostic[];
  symbols: SymbolHit[];
  buildPhase: BuildPhase;
  buildLogs: BuildLogLine[];
  artifacts: Artifact[];
  nodePhase: NodePhase;
  xeroPhase: XeroPhase;
  chats: Record<string, ChatMessage[]>;
  termLines: TermLine[];
  cwd: string;
  previewHtml: string | null;
  xeroOpen: boolean;
  settings: Settings;
  commandPalette: boolean;
  statusMessage: string;
  markHydrated: () => void;
  setView: (view: View) => void;
  setStatus: (msg: string) => void;
  togglePalette: (open?: boolean) => void;
  toggleXero: (open?: boolean) => void;
  createProject: (name: string, templateId: TemplateId) => string;
  importZip: (
    bytes: Uint8Array,
    fileName: string,
  ) => Promise<{ ok: boolean; error?: string; id?: string; imported?: number }>;
  deleteProject: (id: string) => void;
  openProject: (id: string) => void;
  closeProject: () => void;
  writeActive: (content: string) => void;
  saveActive: () => void;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  createFile: (path: string, content?: string) => void;
  createFolder: (path: string) => void;
  deletePath: (path: string) => void;
  renamePath: (from: string, to: string) => void;
  reindex: () => void;
  runBuild: () => void;
  cancelBuild: () => void;
  runPreview: () => void;
  runNode: (path?: string) => void;
  execTerm: (input: string) => void;
  clearTerm: () => void;
  pushChat: (projectId: string, msg: ChatMessage) => void;
  setXeroPhase: (p: XeroPhase) => void;
  applyPatch: (messageId: string, path: string) => void;
  rejectPatches: (messageId: string) => void;
  updateSettings: (partial: Partial<Settings>) => void;
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: true,
  autosave: true,
  xeroEnabled: true,
  compileHost: "",
};

function activeProject(s: XideState): Project | null {
  return s.projects.find((p) => p.id === s.activeProjectId) ?? null;
}

function logLine(level: BuildLogLine["level"], text: string): BuildLogLine {
  return { id: nid("bl"), ts: now(), level, text };
}

function tline(kind: TermLine["kind"], text: string): TermLine {
  return { id: nid("tl"), kind, text };
}

const SEED_IDS = new Set(["proj_pulse", "proj_nebula"]);

function revokeArtifacts(list: Artifact[]) {
  for (const a of list) {
    if (a.href) URL.revokeObjectURL(a.href);
  }
}

function blobHref(data: BlobPart | Uint8Array, type: string): string {
  return URL.createObjectURL(new Blob([data as BlobPart], { type }));
}

let buildGen = 0;


export const useXide = create<XideState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      view: "dashboard",
      projects: [],
      activeProjectId: null,
      openTabs: [],
      activeFile: null,
      dirty: {},
      diagnostics: [],
      symbols: [],
      buildPhase: "idle",
      buildLogs: [],
      artifacts: [],
      nodePhase: "not_started",
      xeroPhase: "idle",
      chats: {},
      termLines: [
        tline("sys", "xIDE v9 terminal · type help"),
      ],
      cwd: "",
      previewHtml: null,
      xeroOpen: false,
      settings: DEFAULT_SETTINGS,
      commandPalette: false,
      statusMessage: "Ready",
      markHydrated: () =>
        set((s) => {
          const projects = s.projects.filter((p) => !SEED_IDS.has(p.id));
          const dropped = s.activeProjectId != null && SEED_IDS.has(s.activeProjectId);
          return {
            hydrated: true,
            projects,
            activeProjectId: dropped ? null : s.activeProjectId,
            openTabs: dropped ? [] : s.openTabs,
            activeFile: dropped ? null : s.activeFile,
            view: dropped ? "dashboard" : s.view,
          };
        }),
      setView: (view) => set({ view }),
      setStatus: (statusMessage) => set({ statusMessage }),
      togglePalette: (open) =>
        set((s) => ({ commandPalette: open ?? !s.commandPalette })),
      toggleXero: (open) =>
        set((s) => ({ xeroOpen: open ?? !s.xeroOpen, view: "workspace" })),
      createProject: (name, templateId) => {
        const trimmed = name.trim() || "Untitled";
        const files = filesForTemplate(templateId, trimmed);
        const project: Project = {
          id: nid("proj"),
          name: trimmed,
          templateId,
          createdAt: now(),
          updatedAt: now(),
          files,
          folders: foldersFor(files),
        };
        set((s) => ({
          projects: [project, ...s.projects],
          activeProjectId: project.id,
          openTabs: [],
          activeFile: null,
          dirty: {},
          view: "workspace",
          statusMessage: `Created ${trimmed}`,
        }));
        get().reindex();
        const first = Object.keys(files)[0];
        if (first) get().openFile(first);
        return project.id;
      },
      importZip: async (bytes, fileName) => {
        set({ statusMessage: "Importing…" });
        try {
          const result = await projectFilesFromZip(bytes, fileName);
          const count = Object.keys(result.files).length;
          if (!count) {
            const extra = describeZipSkips(result.skipped);
            const error = extra
              ? `No source files in that zip (${extra} skipped)`
              : "No source files in that zip";
            set({ statusMessage: error });
            return { ok: false, error };
          }
          const approx = JSON.stringify(result.files).length;
          if (approx > 4_500_000) {
            const error =
              "That project is too large to keep in this browser. Strip build folders and try a source-only zip.";
            set({ statusMessage: error });
            return { ok: false, error };
          }
          const project: Project = {
            id: nid("proj"),
            name: result.name,
            templateId: result.templateId,
            createdAt: now(),
            updatedAt: now(),
            files: result.files,
            folders: foldersFor(result.files),
          };
          const skipNote = describeZipSkips(result.skipped);
          set((s) => ({
            projects: [project, ...s.projects],
            activeProjectId: project.id,
            openTabs: [],
            activeFile: null,
            dirty: {},
            view: "workspace",
            statusMessage: skipNote
              ? `Imported ${project.name} · ${count} files · skipped ${skipNote}`
              : `Imported ${project.name} · ${count} files`,
          }));
          get().reindex();
          const first =
            Object.keys(result.files).find((f) => f === "README.md" || f.endsWith("/README.md")) ??
            Object.keys(result.files)[0];
          if (first) get().openFile(first);
          return { ok: true, id: project.id, imported: count };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          set({ statusMessage: error });
          return { ok: false, error };
        }
      },
      deleteProject: (id) => {
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id);
          const closing = s.activeProjectId === id;
          return {
            projects,
            activeProjectId: closing ? null : s.activeProjectId,
            openTabs: closing ? [] : s.openTabs,
            activeFile: closing ? null : s.activeFile,
            dirty: closing ? {} : s.dirty,
            diagnostics: closing ? [] : s.diagnostics,
            symbols: closing ? [] : s.symbols,
            statusMessage: "Project deleted",
          };
        });
      },
      openProject: (id) => {
        const p = get().projects.find((x) => x.id === id);
        if (!p) return;
        const first =
          Object.keys(p.files).find((f) => f === "README.md") ??
          Object.keys(p.files)[0] ??
          null;
        set({
          activeProjectId: id,
          view: "workspace",
          openTabs: first ? [first] : [],
          activeFile: first,
          dirty: {},
          previewHtml: null,
          statusMessage: `Opened ${p.name}`,
        });
        get().reindex();
      },
      closeProject: () =>
        set({
          activeProjectId: null,
          openTabs: [],
          activeFile: null,
          dirty: {},
          diagnostics: [],
          symbols: [],
          view: "dashboard",
          previewHtml: null,
          statusMessage: "Workspace closed",
        }),
      writeActive: (content) => {
        const s = get();
        const proj = activeProject(s);
        const path = s.activeFile;
        if (!proj || !path || !proj.files[path]) return;
        const files = {
          ...proj.files,
          [path]: { ...proj.files[path], content },
        };
        const projects = s.projects.map((p) =>
          p.id === proj.id ? { ...p, files, updatedAt: now() } : p,
        );
        set({
          projects,
          dirty: s.settings.autosave
            ? { ...s.dirty, [path]: false }
            : { ...s.dirty, [path]: true },
        });
        if (s.settings.autosave) get().reindex();
      },
      saveActive: () => {
        const s = get();
        if (!s.activeFile) return;
        const dirty = { ...s.dirty };
        dirty[s.activeFile] = false;
        set({ dirty, statusMessage: "Saved" });
        get().reindex();
      },
      openFile: (path) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj?.files[path]) return;
        const openTabs = s.openTabs.includes(path)
          ? s.openTabs
          : [...s.openTabs, path];
        set({ openTabs, activeFile: path, view: "workspace" });
      },
      closeTab: (path) => {
        set((s) => {
          const openTabs = s.openTabs.filter((t) => t !== path);
          const activeFile =
            s.activeFile === path ? (openTabs[openTabs.length - 1] ?? null) : s.activeFile;
          return { openTabs, activeFile };
        });
      },
      createFile: (path, content = "") => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) return;
        const clean = path.replace(/^\/+/, "").replace(/\/+/g, "/");
        if (!clean || proj.files[clean]) return;
        const files = {
          ...proj.files,
          [clean]: { content, language: languageForPath(clean) },
        };
        const folders = foldersFor(files);
        const projects = s.projects.map((p) =>
          p.id === proj.id ? { ...p, files, folders, updatedAt: now() } : p,
        );
        set({
          projects,
          openTabs: [...s.openTabs, clean],
          activeFile: clean,
          statusMessage: `Created ${clean}`,
        });
        get().reindex();
      },
      createFolder: (path) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) return;
        const clean = path.replace(/^\/+|\/+$/g, "");
        if (!clean) return;
        const folders = Array.from(new Set([...proj.folders, clean])).sort();
        const projects = s.projects.map((p) =>
          p.id === proj.id ? { ...p, folders, updatedAt: now() } : p,
        );
        set({ projects, statusMessage: `Folder ${clean}` });
      },
      deletePath: (path) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) return;
        const files = { ...proj.files };
        delete files[path];
        for (const k of Object.keys(files)) {
          if (k.startsWith(path + "/")) delete files[k];
        }
        const folders = proj.folders.filter(
          (f) => f !== path && !f.startsWith(path + "/"),
        );
        const openTabs = s.openTabs.filter(
          (t) => t !== path && !t.startsWith(path + "/"),
        );
        const projects = s.projects.map((p) =>
          p.id === proj.id ? { ...p, files, folders, updatedAt: now() } : p,
        );
        set({
          projects,
          openTabs,
          activeFile: openTabs.includes(s.activeFile ?? "")
            ? s.activeFile
            : (openTabs[0] ?? null),
          statusMessage: `Deleted ${path}`,
        });
        get().reindex();
      },
      renamePath: (from, to) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj || !proj.files[from] || !to) return;
        const files = { ...proj.files };
        files[to] = { ...files[from], language: languageForPath(to) };
        delete files[from];
        const openTabs = s.openTabs.map((t) => (t === from ? to : t));
        const projects = s.projects.map((p) =>
          p.id === proj.id
            ? { ...p, files, folders: foldersFor(files), updatedAt: now() }
            : p,
        );
        set({
          projects,
          openTabs,
          activeFile: s.activeFile === from ? to : s.activeFile,
          statusMessage: `Renamed to ${to}`,
        });
        get().reindex();
      },
      reindex: () => {
        const proj = activeProject(get());
        if (!proj) {
          set({ diagnostics: [], symbols: [] });
          return;
        }
        set({
          diagnostics: analyzeProject(proj),
          symbols: indexProject(proj),
        });
      },
      runBuild: () => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) {
          set({ statusMessage: "Open a project first", view: "projects" });
          return;
        }
        if (s.buildPhase === "running") return;
        const gen = ++buildGen;
        revokeArtifacts(s.artifacts);
        get().reindex();
        const fileCount = Object.keys(proj.files).length;
        const bytes = projectSize(proj);
        set({
          view: "build",
          buildPhase: "running",
          buildLogs: [
            logLine("info", `Packaging ${proj.name} · ${fileCount} files · ${formatBytes(bytes)}`),
          ],
          artifacts: [],
          statusMessage: "Packaging",
        });

        void (async () => {
          const still = () => get().buildPhase === "running" && gen === buildGen;
          const push = (line: BuildLogLine) => {
            if (!still()) return;
            set((cur) => ({ buildLogs: [...cur.buildLogs, line] }));
          };

          const snap = get();
          const indexed = snap.symbols.length;
          const errors = snap.diagnostics.filter((d) => d.severity === "error");
          const warns = snap.diagnostics.filter((d) => d.severity === "warning");
          push(logLine("info", `Indexed ${indexed} symbols`));
          push(
            logLine(
              errors.length ? "warn" : "info",
              `Diagnostics · ${errors.length} errors · ${warns.length} warnings`,
            ),
          );
          for (const e of errors.slice(0, 8)) {
            push(logLine("error", `${e.file}:${e.line} ${e.message}`));
          }

          const artifacts: Artifact[] = [];
          try {
            const zip = zipFiles(
              Object.fromEntries(
                Object.entries(proj.files).map(([path, f]) => [path, f.content]),
              ),
              proj.updatedAt,
            );
            const zname = safeZipName(proj.name);
            artifacts.push({
              name: zname,
              kind: "zip",
              sizeLabel: formatBytes(zip.byteLength),
              path: zname,
              href: blobHref(zip, "application/zip"),
            });
            push(logLine("ok", `Wrote ${zname} (${formatBytes(zip.byteLength)})`));
          } catch (err) {
            if (!still()) return;
            set((cur) => ({
              buildPhase: "failed",
              buildLogs: [
                ...cur.buildLogs,
                logLine("error", err instanceof Error ? err.message : String(err)),
              ],
              statusMessage: "Package failed",
            }));
            return;
          }

          if (proj.templateId === "python") {
            push(
              logLine(
                "warn",
                "No Python interpreter in this environment — source zip only",
              ),
            );
          }

          const hasJvmSources = Object.keys(proj.files).some(
            (p) => p.endsWith(".kt") || p.endsWith(".java"),
          );
          if (hasJvmSources) {
            const host = (get().settings.compileHost ?? "").trim();
            push(
              logLine(
                "info",
                host
                  ? `Starting toolchain on compile host ${host}…`
                  : "Starting JDK/Kotlin/Gradle toolchain…",
              ),
            );
            try {
              const result = await compileProjectFiles(
                {
                  projectName: proj.name,
                  templateId: proj.templateId,
                  files: Object.fromEntries(
                    Object.entries(proj.files).map(([p, f]) => [p, f.content]),
                  ),
                  run: true,
                },
                host,
              );
              if (!still()) return;
              for (const l of result.logs) push(logLine(l.level, l.text));
              if (result.skipped) push(logLine("warn", result.skipped));
              if (result.diagnostics.length) {
                const compiled = result.diagnostics.map((d, i) => ({
                  id: `cmp_${i}_${d.file}_${d.line}`,
                  file: d.file,
                  line: d.line,
                  col: d.col,
                  severity: d.severity,
                  message: d.message,
                  source: "compiler" as const,
                }));
                set((cur) => ({
                  diagnostics: [
                    ...compiled,
                    ...cur.diagnostics.filter((d) => d.source !== "compiler"),
                  ],
                }));
              }
              for (const a of result.artifacts) {
                const raw = atob(a.base64);
                const bin = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
                artifacts.push({
                  name: a.name,
                  kind: a.name.endsWith(".apk")
                    ? "apk"
                    : a.name.endsWith(".jar")
                      ? "jar"
                      : "output",
                  sizeLabel: formatBytes(bin.byteLength),
                  path: a.name,
                  href: blobHref(bin, a.mime),
                });
              }
              if (!result.ok) {
                const startedFail = get().buildLogs[0]?.ts ?? Date.now();
                const secsFail = ((Date.now() - startedFail) / 1000).toFixed(2);
                set((cur) => ({
                  buildPhase: "failed",
                  artifacts,
                  buildLogs: [...cur.buildLogs, logLine("error", `FAILED in ${secsFail}s`)],
                  statusMessage: "Compile failed",
                }));
                return;
              }
            } catch (err) {
              if (!still()) return;
              push(
                logLine("error", err instanceof Error ? err.message : String(err)),
              );
              set((cur) => ({
                buildPhase: "failed",
                artifacts,
                buildLogs: cur.buildLogs,
                statusMessage: "Compile failed",
              }));
              return;
            }
          }

          if (proj.templateId === "web-app" || proj.files["index.html"]) {
            const html = collectHtmlPreview(proj);
            if (html) {
              artifacts.push({
                name: "preview.html",
                kind: "preview",
                sizeLabel: formatBytes(html.length),
                path: "preview.html",
                href: blobHref(html, "text/html;charset=utf-8"),
              });
              push(logLine("ok", `Assembled preview.html (${formatBytes(html.length)})`));
              if (still()) set({ previewHtml: html });
            } else {
              push(logLine("warn", "No HTML entrypoint to assemble"));
            }
          }

          let nodeFailed = false;
          const jsEntry =
            proj.templateId === "node-script"
              ? proj.files["index.js"]
                ? "index.js"
                : Object.keys(proj.files).find((p) => p.endsWith(".js"))
              : undefined;
          if (jsEntry && proj.files[jsEntry]) {
            set({ nodePhase: "starting" });
            const extra: Record<string, string> = {};
            for (const [p, f] of Object.entries(proj.files)) {
              if (p !== jsEntry && (f.language === "javascript" || f.language === "typescript")) {
                extra[p] = f.content;
              }
            }
            if (!still()) return;
            set({ nodePhase: "running" });
            push(logLine("info", `node ${jsEntry}`));
            const source = proj.files[jsEntry]!.content;
            const { stdout, stderr } = await runJsModule(source, extra);
            if (!still()) return;
            for (const t of stdout) push(logLine("ok", t));
            for (const t of stderr) push(logLine("error", t));
            nodeFailed = stderr.length > 0;
            set({ nodePhase: nodeFailed ? "failed" : "stopped" });
            if (!stdout.length && !stderr.length) push(logLine("info", "(no output)"));
          }

          if (!still()) return;
          const started = get().buildLogs[0]?.ts ?? Date.now();
          const secs = ((Date.now() - started) / 1000).toFixed(2);
          if (nodeFailed) {
            set((cur) => ({
              buildPhase: "failed",
              artifacts,
              buildLogs: [...cur.buildLogs, logLine("error", `FAILED in ${secs}s`)],
              statusMessage: "Run failed",
            }));
            return;
          }
          set((cur) => ({
            buildPhase: "success",
            artifacts,
            buildLogs: [...cur.buildLogs, logLine("ok", `DONE in ${secs}s`)],
            statusMessage: `Built ${proj.name}`,
          }));
        })();
      },
      cancelBuild: () => {
        if (get().buildPhase !== "running") return;
        buildGen += 1;
        abortJsRun();
        set((s) => ({
          buildPhase: "cancelled",
          buildLogs: [...s.buildLogs, logLine("warn", "Cancelled")],
          statusMessage: "Build cancelled",
        }));
      },
      runPreview: () => {
        const proj = activeProject(get());
        if (!proj) return;
        const html = collectHtmlPreview(proj);
        if (!html) {
          set((s) => ({
            termLines: [...s.termLines, tline("err", "No HTML file in this workspace")],
            view: "terminal",
          }));
          return;
        }
        set({ previewHtml: html, view: "workspace", statusMessage: "Preview ready" });
      },
      runNode: (path) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) return;
        const target = path ?? (proj.files["index.js"] ? "index.js" : s.activeFile);
        if (!target || !proj.files[target]) {
          set((cur) => ({
            termLines: [...cur.termLines, tline("err", "No JS entrypoint")],
            view: "terminal",
          }));
          return;
        }
        const lang = proj.files[target].language;
        if (lang !== "javascript" && lang !== "typescript") {
          set((cur) => ({
            termLines: [
              ...cur.termLines,
              tline("err", `${target} is ${lang || "not JavaScript"} — node runs JS only`),
            ],
            view: "terminal",
          }));
          return;
        }
        const extra: Record<string, string> = {};
        for (const [p, f] of Object.entries(proj.files)) {
          if (p !== target && (f.language === "javascript" || f.language === "typescript")) {
            extra[p] = f.content;
          }
        }
        set({ nodePhase: "starting", view: "terminal" });
        void (async () => {
          set({ nodePhase: "running" });
          const { stdout, stderr } = await runJsModule(proj.files[target].content, extra);
          const lines: TermLine[] = [
            tline("sys", `node ${target}`),
            ...stdout.map((t) => tline("out", t)),
            ...stderr.map((t) => tline("err", t)),
          ];
          if (!stdout.length && !stderr.length) lines.push(tline("out", "(no output)"));
          set((cur) => ({
            termLines: [...cur.termLines, ...lines],
            nodePhase: stderr.length ? "failed" : "stopped",
            statusMessage: stderr.length ? "Node failed" : `Ran ${target}`,
          }));
        })();
      },
      execTerm: (input) => {
        const raw = input.trim();
        if (!raw) return;
        const s = get();
        const proj = activeProject(s);
        const parts = raw.split(/\s+/);
        const cmd = parts[0] ?? "";
        const args = parts.slice(1);
        const echo = tline("in", `${s.cwd || "~"} ▸ ${raw}`);
        const emit = (...lines: TermLine[]) =>
          set((cur) => ({ termLines: [...cur.termLines, echo, ...lines], view: "terminal" }));

        if (cmd === "help") {
          emit(
            tline(
              "out",
              [
                "ls              list workspace files",
                "cat <file>      print a file",
                "touch <file>    create an empty file",
                "rm <path>       delete file or folder",
                "clear           clear the buffer",
                "node [file]     run JavaScript in a sandboxed iframe",
                "preview         assemble HTML preview from VFS files",
                "build           zip, then compile Kotlin/Java with JDK/Gradle if present",
                "gradle          same as build for JVM projects",
                "java | javac    compile and run Java/Kotlin",
                "kotlinc         compile and run Kotlin",
                "symbols [q]     search the index",
                "diag            print diagnostics",
                "xero            open Xero",
              ].join("\n"),
            ),
          );
          return;
        }
        if (cmd === "clear") {
          set({ termLines: [tline("sys", "buffer cleared")] });
          return;
        }
        if (cmd === "ls") {
          if (!proj) {
            emit(tline("err", "no project"));
            return;
          }
          const names = [
            ...proj.folders.map((f) => f + "/"),
            ...Object.keys(proj.files),
          ].sort();
          emit(tline("out", names.join("\n") || "(empty)"));
          return;
        }
        if (cmd === "cat") {
          const path = args[0];
          if (!proj || !path || !proj.files[path]) {
            emit(tline("err", "file not found"));
            return;
          }
          emit(tline("out", proj.files[path].content));
          return;
        }
        if (cmd === "touch") {
          const path = args[0];
          if (!path) {
            emit(tline("err", "usage: touch <file>"));
            return;
          }
          get().createFile(path);
          emit(tline("sys", `created ${path}`));
          return;
        }
        if (cmd === "rm") {
          const path = args[0];
          if (!path) {
            emit(tline("err", "usage: rm <path>"));
            return;
          }
          get().deletePath(path);
          emit(tline("sys", `removed ${path}`));
          return;
        }
        if (cmd === "node") {
          set((cur) => ({ termLines: [...cur.termLines, echo] }));
          get().runNode(args[0]);
          return;
        }
        if (cmd === "preview") {
          set((cur) => ({ termLines: [...cur.termLines, echo] }));
          get().runPreview();
          return;
        }
        if (cmd === "build") {
          set((cur) => ({
            termLines: [...cur.termLines, echo, tline("sys", "packaging workspace")],
          }));
          get().runBuild();
          return;
        }
        if (cmd === "python" || cmd === "python3" || cmd === "pip") {
          emit(tline("err", "No Python interpreter in this environment"));
          return;
        }
        if (
          cmd === "gradle" ||
          cmd === "gradlew" ||
          cmd === "kotlinc" ||
          cmd === "kotlin" ||
          cmd === "javac" ||
          cmd === "java"
        ) {
          set((cur) => ({
            termLines: [
              ...cur.termLines,
              echo,
              tline("sys", "handing off to JDK / Gradle toolchain"),
            ],
          }));
          get().runBuild();
          return;
        }
        if (cmd === "symbols") {
          const q = args.join(" ").toLowerCase();
          const hits = get().symbols.filter(
            (h) => !q || h.name.toLowerCase().includes(q),
          );
          emit(
            tline(
              "out",
              hits
                .slice(0, 30)
                .map((h) => `${h.kind.padEnd(10)} ${h.name}  ${h.file}:${h.line}`)
                .join("\n") || "(no symbols)",
            ),
          );
          return;
        }
        if (cmd === "diag") {
          const d = get().diagnostics;
          emit(
            tline(
              "out",
              d.map((x) => `${x.severity} ${x.file}:${x.line} ${x.message}`).join("\n") ||
                "no diagnostics",
            ),
          );
          return;
        }
        if (cmd === "xero") {
          set({ xeroOpen: true, view: "workspace" });
          emit(tline("sys", "Xero panel opened"));
          return;
        }
        emit(tline("err", `unknown command: ${cmd}`));
      },
      clearTerm: () => set({ termLines: [tline("sys", "buffer cleared")] }),
      pushChat: (projectId, msg) =>
        set((s) => ({
          chats: {
            ...s.chats,
            [projectId]: [...(s.chats[projectId] ?? []), msg],
          },
        })),
      setXeroPhase: (xeroPhase) => set({ xeroPhase }),
      applyPatch: (messageId, path) => {
        const s = get();
        const proj = activeProject(s);
        if (!proj) return;
        const msgs = s.chats[proj.id] ?? [];
        const msg = msgs.find((m) => m.id === messageId);
        const patch = msg?.patches?.find((p) => p.path === path);
        if (!patch) return;
        const files = {
          ...proj.files,
          [path]: {
            content: patch.content,
            language: languageForPath(path),
          },
        };
        const projects = s.projects.map((p) =>
          p.id === proj.id
            ? { ...p, files, folders: foldersFor(files), updatedAt: now() }
            : p,
        );
        const chats = {
          ...s.chats,
          [proj.id]: msgs.map((m) =>
            m.id === messageId ? { ...m, approval: "approved" as const } : m,
          ),
        };
        const openTabs = s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path];
        set({
          projects,
          chats,
          openTabs,
          activeFile: path,
          statusMessage: `Applied ${path}`,
          xeroPhase: "success",
        });
        get().reindex();
      },
      rejectPatches: (messageId) => {
        const s = get();
        const id = s.activeProjectId;
        if (!id) return;
        set({
          chats: {
            ...s.chats,
            [id]: (s.chats[id] ?? []).map((m) =>
              m.id === messageId ? { ...m, approval: "rejected" as const } : m,
            ),
          },
          xeroPhase: "idle",
        });
      },
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
    }),
    {
      name: "xide-v9",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
          : localStorage,
      ),
      skipHydration: true,
      partialize: (s) => ({
        view: s.view,
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        openTabs: s.openTabs,
        activeFile: s.activeFile,
        chats: s.chats,
        settings: s.settings,
        xeroOpen: s.xeroOpen,
      }),
    },
  ),
);
