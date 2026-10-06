import type { ReactNode } from "react";
import { ArrowRight, FileArchive, FolderOpen, Plus, Smartphone, Sparkles } from "lucide-react";
import { StatusDot, toneForBuild, toneForNode, toneForXero } from "./StatusDot";
import { triggerZipImport } from "./ZipImportButton";
import { TEMPLATES } from "@/lib/xide/templates";
import { useXide } from "@/lib/xide/store";
import { formatBytes, workspaceStats } from "@/lib/xide/runtime";

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Dashboard() {
  const projects = useXide((s) => s.projects);
  const setView = useXide((s) => s.setView);
  const openProject = useXide((s) => s.openProject);
  const toggleXero = useXide((s) => s.toggleXero);
  const build = useXide((s) => s.buildPhase);
  const node = useXide((s) => s.nodePhase);
  const xero = useXide((s) => s.xeroPhase);
  const compileHost = useXide((s) => (s.settings.compileHost ?? "").trim());
  const recent = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const vfs = workspaceStats(projects);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 overflow-auto p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-subtle uppercase">
            xIDE v9
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
            {projects.length ? "Welcome back." : "Start a workspace."}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {projects.length
              ? "Projects on this device. Xero proposes, you approve."
              : "Nothing stored yet. Create a project from a template, or import a zip of source files. Files live in this browser until you download a zip."}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => setView("templates")}
        >
          <Plus className="size-4" />
          New project
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
            Quick actions
          </p>
          <div className="mt-4 grid gap-2">
            <Action
              icon={<Plus className="size-4" />}
              label="New project"
              hint="From a v9 template"
              onClick={() => setView("templates")}
            />
            <Action
              icon={<FileArchive className="size-4" />}
              label="Import zip"
              hint="Recovered source, not an APK"
              onClick={triggerZipImport}
            />
            <Action
              icon={<FolderOpen className="size-4" />}
              label="Open project"
              hint={`${projects.length} on this device`}
              onClick={() => setView("projects")}
            />
            <Action
              icon={<Smartphone className="size-4" />}
              label="Phone app"
              hint="Install native xIDE — assemble on the device"
              onClick={() => setView("native")}
            />
            <Action
              icon={<Sparkles className="size-4" />}
              label="Ask Xero"
              hint="Explain, diagnose, patch"
              onClick={() => toggleXero(true)}
            />
            <Action
              icon={<ArrowRight className="size-4" />}
              label="Android SDK"
              hint="Download onto this machine, like AIDE"
              onClick={() => setView("settings")}
            />
          </div>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
              Recent projects
            </p>
            <button
              type="button"
              className="text-xs text-muted hover:text-fg"
              onClick={() => setView("projects")}
            >
              All
            </button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {recent.length === 0 ? (
              <li className="py-6 text-sm text-muted">No recent projects.</li>
            ) : (
              recent.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between py-3 text-left"
                    onClick={() => openProject(p.id)}
                  >
                    <span>
                      <span className="block text-sm text-fg">{p.name}</span>
                      <span className="block text-xs text-subtle">
                        {p.templateId} · {timeAgo(p.updatedAt)}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-subtle" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
            Templates
          </p>
          <ul className="mt-3 space-y-2">
            {TEMPLATES.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-baseline justify-between text-sm">
                <span className="text-fg">{t.name}</span>
                <span className="text-xs text-subtle">{t.languages.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-border)]">
          <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
            System status
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <StatusDot tone={toneForBuild(build)} label={`Build · ${build}`} />
            <StatusDot
              tone={toneForNode(node)}
              label={`Node · ${node.replaceAll("_", " ")}`}
            />
            <StatusDot tone={toneForXero(xero)} label={`Xero · ${xero}`} />
            <StatusDot
              tone={compileHost ? "ok" : "idle"}
              label={
                compileHost
                  ? `Compile · ${compileHost}`
                  : "Compile · this machine"
              }
            />
            <StatusDot
              tone={vfs.files ? "ok" : "idle"}
              label={
                vfs.files
                  ? `VFS · ${vfs.files} files · ${formatBytes(vfs.bytes)}`
                  : "VFS · empty"
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Action({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center gap-3 rounded-md bg-elevated px-3 text-left hover:shadow-[var(--shadow-border-hover)]"
    >
      <span className="text-accent">{icon}</span>
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </button>
  );
}
