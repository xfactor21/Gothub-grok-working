import { useEffect, useMemo, useRef } from "react";
import { highlight } from "@/lib/xide/highlight";
import { useXide } from "@/lib/xide/store";

export function CodeEditor() {
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const activeFile = useXide((s) => s.activeFile);
  const writeActive = useXide((s) => s.writeActive);
  const saveActive = useXide((s) => s.saveActive);
  const fontSize = useXide((s) => s.settings.fontSize);
  const tabSize = useXide((s) => s.settings.tabSize);
  const wordWrap = useXide((s) => s.settings.wordWrap);
  const diagnostics = useXide((s) => s.diagnostics);

  const file = activeFile && project ? project.files[activeFile] : null;
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const html = useMemo(
    () => (file ? highlight(file.content, file.language) : ""),
    [file],
  );
  const lines = file ? file.content.split("\n").length : 1;
  const marks = diagnostics.filter((d) => d.file === activeFile);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const onScroll = () => {
      if (preRef.current) preRef.current.scrollTop = ta.scrollTop;
      if (preRef.current) preRef.current.scrollLeft = ta.scrollLeft;
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    };
    ta.addEventListener("scroll", onScroll);
    return () => ta.removeEventListener("scroll", onScroll);
  }, [activeFile]);

  if (!file || !activeFile) {
    return (
      <div className="flex h-full items-center justify-center bg-panel text-sm text-muted">
        Open a file from the explorer.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-panel">
      <div
        ref={gutterRef}
        className="select-none overflow-hidden border-r border-border bg-bg py-3 text-right font-mono text-subtle"
        style={{ fontSize, lineHeight: 1.6, width: 44, paddingRight: 8 }}
        aria-hidden
      >
        {Array.from({ length: lines }, (_, i) => {
          const mark = marks.find((m) => m.line === i + 1);
          return (
            <div
              key={i}
              className={
                mark?.severity === "error"
                  ? "text-danger"
                  : mark
                    ? "text-warn"
                    : ""
              }
            >
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-3 font-mono"
          style={{
            fontSize,
            lineHeight: 1.6,
            tabSize,
            whiteSpace: wordWrap ? "pre-wrap" : "pre",
            wordBreak: wordWrap ? "break-word" : "normal",
          }}
          dangerouslySetInnerHTML={{ __html: html + "\n" }}
        />
        <textarea
          ref={taRef}
          value={file.content}
          spellCheck={false}
          onChange={(e) => writeActive(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              saveActive();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const pad = " ".repeat(tabSize);
              const next =
                file.content.slice(0, start) + pad + file.content.slice(end);
              writeActive(next);
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + pad.length;
              });
            }
          }}
          className="absolute inset-0 h-full w-full resize-none bg-transparent p-3 font-mono text-transparent caret-accent outline-none"
          style={{
            fontSize,
            lineHeight: 1.6,
            tabSize,
            whiteSpace: wordWrap ? "pre-wrap" : "pre",
            wordBreak: wordWrap ? "break-word" : "normal",
          }}
          aria-label={activeFile}
        />
      </div>
    </div>
  );
}
