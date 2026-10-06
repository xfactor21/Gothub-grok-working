import type { Diagnostic, Project } from "./types";

let seq = 0;
function id(): string {
  seq += 1;
  return `d${seq}`;
}

function braces(text: string): { open: number; close: number } {
  const open = (text.match(/[({[]/g) ?? []).length;
  const close = (text.match(/[)}\]]/g) ?? []).length;
  return { open, close };
}

export function analyzeProject(project: Project): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [file, rec] of Object.entries(project.files)) {
    const lines = rec.content.split("\n");
    const { open, close } = braces(rec.content);
    if (open !== close) {
      out.push({
        id: id(),
        file,
        line: lines.length,
        col: 1,
        severity: "error",
        message: `Unbalanced delimiters (${open} open / ${close} close)`,
        source: "compiler",
      });
    }
    lines.forEach((line, i) => {
      if (/\bTODO\b/.test(line)) {
        out.push({
          id: id(),
          file,
          line: i + 1,
          col: line.indexOf("TODO") + 1,
          severity: "info",
          message: "TODO marker",
          source: "linter",
        });
      }
      if (/\bFIXME\b/.test(line)) {
        out.push({
          id: id(),
          file,
          line: i + 1,
          col: Math.max(1, line.indexOf("FIXME") + 1),
          severity: "warning",
          message: "FIXME marker",
          source: "linter",
        });
      }
      if (rec.language === "javascript" || rec.language === "typescript") {
        if (/\bvar\s+/.test(line)) {
          out.push({
            id: id(),
            file,
            line: i + 1,
            col: 1,
            severity: "warning",
            message: "Prefer const/let over var",
            source: "linter",
          });
        }
        if (/==[^=]/.test(line) && !/===/.test(line)) {
          out.push({
            id: id(),
            file,
            line: i + 1,
            col: line.indexOf("==") + 1,
            severity: "warning",
            message: "Use strict equality (===)",
            source: "linter",
          });
        }
      }
      if (/(api[_-]?key|secret|password)\s*[:=]/i.test(line)) {
        out.push({
          id: id(),
          file,
          line: i + 1,
          col: 1,
          severity: "error",
          message: "Possible secret in source — redact before sharing with Xero",
          source: "linter",
        });
      }
    });
  }
  return out;
}
