import { Play, Square } from "lucide-react";
import { StatusDot, toneForBuild } from "./StatusDot";
import { useXide } from "@/lib/xide/store";

const PHASE_LABEL: Record<string, string> = {
  idle: "Idle",
  running: "Compiling",
  success: "Build complete",
  failed: "Build failed",
  cancelled: "Cancelled",
};

export function BuildPanel() {
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const phase = useXide((s) => s.buildPhase);
  const logs = useXide((s) => s.buildLogs);
  const artifacts = useXide((s) => s.artifacts);
  const diagnostics = useXide((s) => s.diagnostics);
  const runBuild = useXide((s) => s.runBuild);
  const cancelBuild = useXide((s) => s.cancelBuild);
  const runPreview = useXide((s) => s.runPreview);
  const compileHost = useXide((s) => s.settings.compileHost ?? "");
  const hostLabel = compileHost.trim()
    ? `Compile · ${compileHost.trim()}`
    : "Compile · this machine";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-auto p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
            v9 toolchain
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Compile</h1>
          <p className="mt-1 text-sm text-muted">
            {project
              ? `${project.name} · ${project.templateId}`
              : "Open a project to compile"}
          </p>
        </div>
        <div className="flex gap-2">
          {phase === "running" ? (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm"
              onClick={cancelBuild}
            >
              <Square className="size-3.5" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-40"
              disabled={!project}
              onClick={runBuild}
            >
              <Play className="size-3.5" />
              {project?.templateId === "android-compose"
                ? "Assemble APK"
                : project?.templateId === "kotlin-jvm" || project?.templateId === "java"
                  ? "Compile & run"
                  : "Package"}
            </button>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Build state
        </p>
        <div className="mt-3">
          <StatusDot tone={toneForBuild(phase)} label={PHASE_LABEL[phase] ?? phase} />
        </div>
        <p className="mt-2 text-xs text-subtle">{hostLabel}</p>
        {!compileHost.trim() ? (
          <button
            type="button"
            className="mt-3 text-xs text-accent hover:underline"
            onClick={() => useXide.getState().setView("settings")}
          >
            Set up the SDK or a host
          </button>
        ) : null}
      </section>

      <div className="grid min-h-0 gap-4 lg:grid-cols-2">
        <section className="flex min-h-64 flex-col rounded-lg border border-border bg-surface">
          <p className="border-b border-border px-4 py-2 text-[11px] tracking-[0.14em] text-subtle uppercase">
            Log
          </p>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-subtle">No runs this session.</p>
            ) : (
              logs.map((l) => (
                <p
                  key={l.id}
                  className={
                    l.level === "error"
                      ? "text-danger"
                      : l.level === "ok"
                        ? "text-ok"
                        : l.level === "warn"
                          ? "text-warn"
                          : "text-muted"
                  }
                >
                  {l.text}
                </p>
              ))
            )}
          </div>
        </section>
        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
              Artifacts
            </p>
            {artifacts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
              Evidence-based artifacts appear only after a successful package.
              Downloads are the real bytes from this workspace.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {artifacts.map((a) => (
                  <li
                    key={a.path}
                    className="flex items-center justify-between rounded-md bg-elevated px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="font-mono text-[11px] text-subtle">{a.path}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-muted">{a.sizeLabel}</span>
                      {a.href ? (
                        <a
                          href={a.href}
                          download={a.name}
                          className="text-xs text-accent hover:underline"
                        >
                          Download
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {project?.templateId === "web-app" ? (
              <button
                type="button"
                className="mt-3 h-9 rounded-md border border-border px-3 text-sm text-fg"
                onClick={runPreview}
              >
                Open preview
              </button>
            ) : null}
          </section>
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
              Diagnostics
            </p>
            <p className="mt-2 text-sm tabular-nums text-muted">
              {diagnostics.filter((d) => d.severity === "error").length} errors ·{" "}
              {diagnostics.filter((d) => d.severity === "warning").length} warnings
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {diagnostics.slice(0, 6).map((d) => (
                <li key={d.id} className="truncate text-muted">
                  <span
                    className={
                      d.severity === "error"
                        ? "text-danger"
                        : d.severity === "warning"
                          ? "text-warn"
                          : "text-info"
                    }
                  >
                    {d.severity}
                  </span>{" "}
                  {d.file}:{d.line} {d.message}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
