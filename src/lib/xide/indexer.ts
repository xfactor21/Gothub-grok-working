import type { Project, SymbolHit } from "./types";

export function indexProject(project: Project): SymbolHit[] {
  const hits: SymbolHit[] = [];
  for (const [file, rec] of Object.entries(project.files)) {
    const lines = rec.content.split("\n");
    lines.forEach((line, i) => {
      const n = i + 1;
      const patterns: Array<[RegExp, SymbolHit["kind"]]> = [
        [/\b(?:class|data class|sealed class|object)\s+([A-Z][\w]*)/, "class"],
        [/\binterface\s+([A-Z][\w]*)/, "interface"],
        [/\b(?:fun|function|def)\s+([A-Za-z_][\w]*)/, "function"],
        [/\b(?:export\s+)?function\s+([A-Za-z_][\w]*)/, "function"],
        [/\b(?:val|var|const|let)\s+([A-Za-z_][\w]*)/, "property"],
        [/\b(?:const|val)\s+([A-Z_][A-Z0-9_]+)\b/, "const"],
      ];
      for (const [re, kind] of patterns) {
        const m = line.match(re);
        if (m?.[1]) {
          hits.push({ name: m[1], kind, file, line: n });
          break;
        }
      }
    });
  }
  return hits;
}

export function searchSymbols(hits: SymbolHit[], q: string): SymbolHit[] {
  const n = q.trim().toLowerCase();
  if (!n) return hits.slice(0, 40);
  return hits.filter(
    (h) =>
      h.name.toLowerCase().includes(n) ||
      h.file.toLowerCase().includes(n) ||
      h.kind.includes(n),
  );
}
