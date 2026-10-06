import type { Project } from "./types";

function vfsPath(href: string): string {
  return href.replace(/^\.\//, "").replace(/^\/+/, "").split("?")[0] ?? href;
}

export function collectHtmlPreview(project: Project): string | null {
  const html =
    project.files["index.html"]?.content ??
    Object.entries(project.files).find(([p]) => /(^|\/)index\.html$/.test(p))?.[1]
      ?.content ??
    Object.entries(project.files).find(([p]) => p.endsWith(".html"))?.[1]?.content;
  if (!html) return null;
  let doc = html;
  doc = doc.replace(/<link\b([^>]*?)>/gi, (full, attrs: string) => {
    const m = /href=["']([^"']+)["']/i.exec(attrs);
    if (!m?.[1] || /^(https?:|data:|\/\/)/i.test(m[1])) return full;
    const rec = project.files[vfsPath(m[1])];
    if (!rec) return full;
    return `<style>\n${rec.content}\n</style>`;
  });
  doc = doc.replace(/<script\b([^>]*)><\/script>/gi, (full, attrs: string) => {
    const m = /src=["']([^"']+)["']/i.exec(attrs);
    if (!m?.[1] || /^(https?:|data:|\/\/)/i.test(m[1])) return full;
    const rec = project.files[vfsPath(m[1])];
    if (!rec) return full;
    return `<script>\n${rec.content}\n<\/script>`;
  });
  return doc;
}

const RUNNER_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function () {
  function send(d) { parent.postMessage(d, "*"); }
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "xide-node-run") return;
    var stdout = [];
    var stderr = [];
    var c = {
      log: function () { stdout.push(Array.prototype.map.call(arguments, String).join(" ")); },
      info: function () { stdout.push(Array.prototype.map.call(arguments, String).join(" ")); },
      warn: function () { stdout.push("[warn] " + Array.prototype.map.call(arguments, String).join(" ")); },
      error: function () { stderr.push(Array.prototype.map.call(arguments, String).join(" ")); }
    };
    try {
      (new Function("console", "\\"use strict\\";\\n" + String(e.data.code || "")))(c);
    } catch (err) {
      stderr.push(err && err.message ? err.message : String(err));
    }
    send({ type: "xide-node-done", stdout: stdout, stderr: stderr });
  });
  send({ type: "xide-node-ready" });
})();
<\/script></body></html>`;

type ActiveRun = {
  iframe: HTMLIFrameElement;
  timer: number;
  onMsg: (e: MessageEvent) => void;
};

let active: ActiveRun | null = null;

export function abortJsRun(): void {
  if (!active) return;
  window.clearTimeout(active.timer);
  window.removeEventListener("message", active.onMsg);
  active.iframe.remove();
  active = null;
}

export function runJsModule(
  source: string,
  extra: Record<string, string> = {},
): Promise<{ stdout: string[]; stderr: string[] }> {
  abortJsRun();
  if (typeof document === "undefined") {
    return Promise.resolve({ stdout: [], stderr: ["No browser runtime"] });
  }
  const prelude = Object.entries(extra)
    .map(([path, code]) => `/* ${path} */\n${stripExports(code)}`)
    .join("\n");
  const body = `${prelude}\n${stripExports(source)}`;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "xIDE runtime");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none";

    const finish = (stdout: string[], stderr: string[]) => {
      if (active?.iframe !== iframe) return;
      abortJsRun();
      resolve({ stdout, stderr });
    };

    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const data = e.data as { type?: string; stdout?: unknown; stderr?: unknown };
      if (data?.type === "xide-node-ready") {
        iframe.contentWindow?.postMessage({ type: "xide-node-run", code: body }, "*");
        return;
      }
      if (data?.type === "xide-node-done") {
        const stdout = Array.isArray(data.stdout) ? data.stdout.map(String) : [];
        const stderr = Array.isArray(data.stderr) ? data.stderr.map(String) : [];
        finish(stdout, stderr);
      }
    };

    window.addEventListener("message", onMsg);
    iframe.srcdoc = RUNNER_HTML;
    document.body.appendChild(iframe);
    const timer = window.setTimeout(() => {
      finish([], ["Timed out after 2s"]);
    }, 2000);
    active = { iframe, timer, onMsg };
  });
}

function stripExports(code: string): string {
  return code.replace(/\bexport\s+default\s+/g, "").replace(/\bexport\s+/g, "");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function projectSize(project: Project): number {
  return Object.values(project.files).reduce((s, f) => s + f.content.length, 0);
}

export function workspaceStats(projects: Project[]): { files: number; bytes: number } {
  return projects.reduce(
    (acc, p) => {
      acc.files += Object.keys(p.files).length;
      acc.bytes += projectSize(p);
      return acc;
    },
    { files: 0, bytes: 0 },
  );
}
