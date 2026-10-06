import { useEffect, useMemo, useState } from "react";
import { useXide } from "@/lib/xide/store";
import type { View } from "@/lib/xide/types";
import { triggerZipImport } from "./ZipImportButton";

const GO: { id: View; label: string }[] = [
  { id: "dashboard", label: "Go to Home" },
  { id: "projects", label: "Go to Projects" },
  { id: "templates", label: "Go to Templates" },
  { id: "workspace", label: "Go to Editor" },
  { id: "terminal", label: "Go to Terminal" },
  { id: "build", label: "Go to Build" },
  { id: "native", label: "Go to Phone app" },
  { id: "settings", label: "Go to Settings" },
];

export function CommandPalette() {
  const open = useXide((s) => s.commandPalette);
  const toggle = useXide((s) => s.togglePalette);
  const setView = useXide((s) => s.setView);
  const projects = useXide((s) => s.projects);
  const openProject = useXide((s) => s.openProject);
  const openFile = useXide((s) => s.openFile);
  const runBuild = useXide((s) => s.runBuild);
  const toggleXero = useXide((s) => s.toggleXero);
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows: { key: string; label: string; run: () => void }[] = [
      ...GO.map((g) => ({
        key: g.id,
        label: g.label,
        run: () => setView(g.id),
      })),
      {
        key: "import",
        label: "Import zip",
        run: () => triggerZipImport(),
      },
      {
        key: "build",
        label: "Compile / package",
        run: () => runBuild(),
      },
      {
        key: "xero",
        label: "Open Xero",
        run: () => toggleXero(true),
      },
      ...projects.map((p) => ({
        key: "p-" + p.id,
        label: `Open project ${p.name}`,
        run: () => openProject(p.id),
      })),
      ...Object.keys(project?.files ?? {}).map((f) => ({
        key: "f-" + f,
        label: `Open ${f}`,
        run: () => openFile(f),
      })),
    ];
    return n
      ? rows.filter((r) => r.label.toLowerCase().includes(n)).slice(0, 18)
      : rows.slice(0, 12);
  }, [q, projects, project, setView, openProject, openFile, runBuild, toggleXero]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-[12vh] px-4">
      <button
        type="button"
        className="absolute inset-0 bg-bg/70"
        aria-label="Close command palette"
        onClick={() => toggle(false)}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-border)]">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Go to, open, run…"
          className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-fg outline-none"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                className="flex h-9 w-full items-center px-4 text-left text-sm text-muted hover:bg-elevated hover:text-fg"
                onClick={() => {
                  it.run();
                  toggle(false);
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
