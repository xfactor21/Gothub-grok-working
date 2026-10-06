import { useState } from "react";
import { ArrowUp, Check, ShieldAlert, Sparkles, X } from "lucide-react";
import { askXero } from "@/lib/xide/xero";
import { useXide } from "@/lib/xide/store";
import type { ChatMessage } from "@/lib/xide/types";

function nid(): string {
  return `m_${Math.random().toString(36).slice(2, 9)}`;
}

export function XeroPanel() {
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const activeFile = useXide((s) => s.activeFile);
  const diagnostics = useXide((s) => s.diagnostics);
  const symbols = useXide((s) => s.symbols);
  const phase = useXide((s) => s.xeroPhase);
  const enabled = useXide((s) => s.settings.xeroEnabled);
  const chats = useXide((s) =>
    project ? (s.chats[project.id] ?? []) : [],
  );
  const pushChat = useXide((s) => s.pushChat);
  const setXeroPhase = useXide((s) => s.setXeroPhase);
  const applyPatch = useXide((s) => s.applyPatch);
  const rejectPatches = useXide((s) => s.rejectPatches);
  const toggleXero = useXide((s) => s.toggleXero);
  const [draft, setDraft] = useState("");

  async function send(text: string) {
    if (!project || !enabled) return;
    const prompt = text.trim();
    if (!prompt) return;
    setDraft("");
    const userMsg: ChatMessage = {
      id: nid(),
      role: "user",
      text: prompt,
      ts: Date.now(),
    };
    pushChat(project.id, userMsg);
    setXeroPhase("thinking");
    const file = activeFile ? project.files[activeFile] : undefined;
    const result = await askXero({
      data: {
        prompt,
        projectName: project.name,
        templateId: project.templateId,
        activeFile,
        activeContent: file?.content ?? "",
        files: Object.keys(project.files),
        diagnostics: diagnostics.map(
          (d) => `${d.severity} ${d.file}:${d.line} ${d.message}`,
        ),
        symbols: symbols.slice(0, 40).map((s) => `${s.kind}:${s.name}`),
      },
    });
    if (!result.ok) {
      pushChat(project.id, {
        id: nid(),
        role: "system",
        text: result.error,
        ts: Date.now(),
      });
      setXeroPhase("error");
      return;
    }
    const patches = result.patches.map((p) => ({
      path: p.path,
      content: p.content,
      original: project.files[p.path]?.content ?? "",
    }));
    pushChat(project.id, {
      id: nid(),
      role: "xero",
      text: result.text.replace(
        /<<<FILE\s+[^\s>]+>>>\s*[\s\S]*?<<<END>>>/g,
        "",
      ).trim() || result.text,
      ts: Date.now(),
      patches: patches.length ? patches : undefined,
      approval: patches.length ? "pending" : undefined,
    });
    setXeroPhase(patches.length ? "warning" : "success");
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-surface">
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
          <Sparkles className="size-3.5 text-accent" />
          Xero
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-sm text-muted hover:text-fg"
          aria-label="Close Xero"
          onClick={() => toggleXero(false)}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {chats.length === 0 ? (
          <div className="space-y-3 pt-6 text-sm text-muted">
            <p className="text-fg">Xero is idle.</p>
            <p>
              Ask for an explanation, a diagnostic walkthrough, or a file patch.
              Filesystem writes stay pending until you approve them.
            </p>
            <div className="flex flex-col gap-2">
              {[
                "Explain the active file",
                "Why are these diagnostics firing?",
                "Propose a settings screen for this project",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-md border border-border bg-elevated px-3 py-2 text-left text-xs text-fg hover:shadow-[var(--shadow-border-hover)]"
                  onClick={() => void send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {chats.map((m) => (
              <article
                key={m.id}
                className={`rounded-md px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-6 bg-elevated text-fg"
                    : m.role === "system"
                      ? "border border-danger/40 text-danger"
                      : "mr-4 bg-bg text-fg"
                }`}
              >
                <p className="mb-1 text-[10px] tracking-[0.14em] text-subtle uppercase">
                  {m.role === "xero" ? "Xero" : m.role === "user" ? "You" : "System"}
                </p>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.patches?.length ? (
                  <div className="mt-3 space-y-2">
                    {m.patches.map((p) => (
                      <div
                        key={p.path}
                        className="rounded-sm border border-border bg-elevated p-2"
                      >
                        <p className="font-mono text-[11px] text-accent">{p.path}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {p.original ? "Modify file" : "Create file"} ·{" "}
                          {p.content.split("\n").length} lines
                        </p>
                        {m.approval === "pending" ? (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 items-center gap-1 rounded-sm bg-accent px-2 text-xs font-medium text-accent-fg"
                              onClick={() => applyPatch(m.id, p.path)}
                            >
                              <Check className="size-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-2 text-xs text-muted"
                              onClick={() => rejectPatches(m.id)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-subtle">
                            {m.approval === "approved" ? "Applied" : "Rejected"}
                          </p>
                        )}
                      </div>
                    ))}
                    {m.approval === "pending" ? (
                      <p className="flex items-center gap-1 text-[11px] text-warn">
                        <ShieldAlert className="size-3.5" />
                        Human approval required
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
            {phase === "thinking" || phase === "working" ? (
              <p className="xide-shimmer px-1 text-sm">Xero is thinking</p>
            ) : null}
          </div>
        )}
      </div>
      <form
        className="border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <div className="flex items-end gap-2 rounded-md border border-border bg-bg px-2 py-1.5">
          <textarea
            value={draft}
            disabled={!enabled || !project}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
            placeholder={
              enabled
                ? "Ask Xero about this workspace"
                : "Xero is disabled in settings"
            }
            className="min-h-10 flex-1 resize-none bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            disabled={!draft.trim() || !enabled || !project}
            className="mb-0.5 flex size-8 items-center justify-center rounded-sm bg-accent text-accent-fg disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
