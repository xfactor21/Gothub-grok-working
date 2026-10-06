import { useEffect, useRef, useState } from "react";
import { useXide } from "@/lib/xide/store";

export function TerminalPanel({ compact = false }: { compact?: boolean }) {
  const lines = useXide((s) => s.termLines);
  const execTerm = useXide((s) => s.execTerm);
  const clearTerm = useXide((s) => s.clearTerm);
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const [value, setValue] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className={`flex min-h-0 flex-col bg-bg ${compact ? "h-full" : "h-full"}`}>
      <div className="flex h-8 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
          Terminal · {project?.name ?? "no project"}
        </span>
        <button
          type="button"
          className="text-[11px] text-muted hover:text-fg"
          onClick={clearTerm}
        >
          Clear
        </button>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
      >
        {lines.map((l) => (
          <pre
            key={l.id}
            className={`whitespace-pre-wrap ${
              l.kind === "in"
                ? "text-accent"
                : l.kind === "err"
                  ? "text-danger"
                  : l.kind === "sys"
                    ? "text-subtle"
                    : "text-fg"
            }`}
          >
            {l.text}
          </pre>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          execTerm(value);
          setValue("");
        }}
      >
        <span className="font-mono text-[12px] text-accent">▸</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 flex-1 bg-transparent font-mono text-[12px] text-fg outline-none"
          placeholder="help"
          aria-label="Terminal command"
          autoComplete="off"
        />
      </form>
    </div>
  );
}
