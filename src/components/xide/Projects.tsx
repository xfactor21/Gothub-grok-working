import { FolderGit2, Trash2 } from "lucide-react";
import { ZipImportButton } from "./ZipImportButton";
import { useXide } from "@/lib/xide/store";

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const h = Math.floor(d / 3600000);
  if (h < 1) return "moments ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Projects() {
  const projects = useXide((s) => s.projects);
  const activeId = useXide((s) => s.activeProjectId);
  const openProject = useXide((s) => s.openProject);
  const deleteProject = useXide((s) => s.deleteProject);
  const setView = useXide((s) => s.setView);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Projects</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ZipImportButton />
          <button
            type="button"
            className="h-10 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg"
            onClick={() => setView("templates")}
          >
            New
          </button>
        </div>
      </div>
      {projects.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          Nothing here yet. Create a project from a template, or import a zip of
          recovered source.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`rounded-lg border bg-surface p-4 shadow-[var(--shadow-border)] ${
                activeId === p.id ? "border-accent/40" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => openProject(p.id)}
                >
                  <span className="flex items-center gap-2 text-fg">
                    <FolderGit2 className="size-4 text-accent" />
                    <span className="truncate font-medium">{p.name}</span>
                  </span>
                  <span className="mt-1 block text-xs text-subtle">
                    {p.templateId} · {Object.keys(p.files).length} files ·{" "}
                    {timeAgo(p.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-sm text-subtle hover:text-danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => deleteProject(p.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
