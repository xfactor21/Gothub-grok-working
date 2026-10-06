import { useState } from "react";
import {
  CircleAlert,
  FileCode,
  Play,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { TerminalPanel } from "./TerminalPanel";
import { XeroPanel } from "./XeroPanel";
import { useXide } from "@/lib/xide/store";

export function Workspace() {
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const tabs = useXide((s) => s.openTabs);
  const activeFile = useXide((s) => s.activeFile);
  const dirty = useXide((s) => s.dirty);
  const diagnostics = useXide((s) => s.diagnostics);
  const openFile = useXide((s) => s.openFile);
  const closeTab = useXide((s) => s.closeTab);
  const xeroOpen = useXide((s) => s.xeroOpen);
  const toggleXero = useXide((s) => s.toggleXero);
  const runBuild = useXide((s) => s.runBuild);
  const runPreview = useXide((s) => s.runPreview);
  const runNode = useXide((s) => s.runNode);
  const previewHtml = useXide((s) => s.previewHtml);
  const setView = useXide((s) => s.setView);
  const [bottom, setBottom] = useState<"term" | "problems" | "preview">("term");
  const [showTree, setShowTree] = useState(true);

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-medium">No workspace open</p>
        <p className="max-w-sm text-sm text-muted">
          Open a project or start from a template.
        </p>
        <button
          type="button"
          className="mt-2 h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => setView("projects")}
        >
          Browse projects
        </button>
      </div>
    );
  }

  const problems = diagnostics;
  const fileDiags = problems.filter((d) => d.file === activeFile);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="h-8 rounded-sm px-2 text-xs text-muted hover:text-fg"
            onClick={() => setShowTree((v) => !v)}
          >
            Files
          </button>
          <p className="truncate text-xs text-subtle">{project.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:bg-elevated hover:text-fg"
            onClick={runBuild}
          >
            <Play className="size-3.5" />
            Compile
          </button>
          {project.templateId === "web-app" ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:bg-elevated hover:text-fg"
              onClick={() => {
                runPreview();
                setBottom("preview");
              }}
            >
              Preview
            </button>
          ) : null}
          {project.templateId === "node-script" ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:bg-elevated hover:text-fg"
              onClick={() => runNode()}
            >
              Run
            </button>
          ) : null}
          {project.templateId === "kotlin-jvm" || project.templateId === "java" ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:bg-elevated hover:text-fg"
              onClick={runBuild}
            >
              Run
            </button>
          ) : null}
          <button
            type="button"
            className={`inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs ${
              xeroOpen ? "bg-elevated text-accent" : "text-muted hover:text-fg"
            }`}
            onClick={() => toggleXero()}
          >
            <Sparkles className="size-3.5" />
            Xero
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          className={`w-[210px] shrink-0 flex-col border-r border-border bg-surface ${
            showTree ? "flex" : "hidden"
          }`}
        >
          <FileTree />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-border bg-bg">
            {tabs.length === 0 ? (
              <span className="px-3 text-xs text-subtle">No tabs</span>
            ) : (
              tabs.map((t) => {
                const on = t === activeFile;
                return (
                  <div
                    key={t}
                    className={`group flex h-full items-center border-r border-border ${
                      on ? "bg-panel text-fg" : "text-muted"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex h-full items-center gap-1.5 px-3 text-xs"
                      onClick={() => openFile(t)}
                    >
                      <FileCode className="size-3" />
                      <span className="max-w-36 truncate">
                        {t.split("/").pop()}
                      </span>
                      {dirty[t] ? (
                        <span className="size-1.5 rounded-full bg-accent" />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="mr-1 hidden size-6 items-center justify-center rounded-sm hover:bg-elevated group-hover:flex"
                      aria-label={`Close ${t}`}
                      onClick={() => closeTab(t)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>
          <div className="flex h-[28%] min-h-[140px] shrink-0 flex-col border-t border-border">
            <div className="flex h-8 items-center gap-1 border-b border-border px-1">
              {(
                [
                  ["term", "Terminal", TerminalSquare],
                  ["problems", "Problems", CircleAlert],
                  ["preview", "Preview", Play],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBottom(id)}
                  className={`inline-flex h-7 items-center gap-1 rounded-sm px-2 text-[11px] ${
                    bottom === id ? "bg-elevated text-fg" : "text-muted"
                  }`}
                >
                  <Icon className="size-3" />
                  {label}
                  {id === "problems" && problems.length ? (
                    <span className="tabular-nums text-warn">{problems.length}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {bottom === "term" ? (
                <TerminalPanel compact />
              ) : bottom === "problems" ? (
                <ul className="h-full overflow-auto px-3 py-2 text-xs">
                  {problems.length === 0 ? (
                    <li className="text-subtle">No diagnostics.</li>
                  ) : (
                    problems.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          className="flex w-full gap-2 py-1 text-left hover:text-fg"
                          onClick={() => openFile(d.file)}
                        >
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
                          </span>
                          <span className="text-muted">
                            {d.file}:{d.line}
                          </span>
                          <span className="truncate text-fg">{d.message}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : previewHtml ? (
                <iframe
                  title="Preview"
                  className="h-full w-full bg-bg"
                  sandbox="allow-scripts"
                  srcDoc={previewHtml}
                />
              ) : (
                <p className="p-3 text-xs text-subtle">
                  Run preview from the toolbar for web projects.
                </p>
              )}
            </div>
          </div>
        </div>
        {xeroOpen ? (
          <div className="hidden w-[320px] shrink-0 lg:block">
            <XeroPanel />
          </div>
        ) : null}
      </div>
      {xeroOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-bg/70"
            aria-label="Dismiss Xero"
            onClick={() => toggleXero(false)}
          />
          <div className="absolute inset-x-0 bottom-0 h-[75%] rounded-t-xl border-t border-border">
            <XeroPanel />
          </div>
        </div>
      ) : null}
      {fileDiags.length ? (
        <p className="sr-only">
          {fileDiags.length} issues in the active file
        </p>
      ) : null}
    </div>
  );
}
