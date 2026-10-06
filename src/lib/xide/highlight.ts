function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


type Rule = { re: RegExp; cls: string };

function applyRules(src: string, rules: Rule[]): string {
  const hits: { start: number; end: number; cls: string }[] = [];
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const start = m.index;
      const end = start + m[0].length;
      if (end === start) {
        re.lastIndex++;
        continue;
      }
      const overlap = hits.some((h) => start < h.end && end > h.start);
      if (!overlap) hits.push({ start, end, cls: rule.cls });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    out += escapeHtml(src.slice(cursor, h.start));
    out += `<span class="${h.cls}">${escapeHtml(src.slice(h.start, h.end))}</span>`;
    cursor = h.end;
  }
  out += escapeHtml(src.slice(cursor));
  return out;
}

const JS_KW =
  /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|static|get|set|void|yield|null|undefined|true|false)\b/;
const KT_KW =
  /\b(package|import|class|fun|val|var|override|if|else|when|for|while|return|null|true|false|object|interface|data|sealed|companion|private|public|internal|protected|suspend|compose|Composable|by|in|is|as)\b/;
const PY_KW =
  /\b(def|class|return|if|elif|else|for|while|import|from|as|in|not|and|or|None|True|False|with|try|except|finally|yield|lambda|pass|break|continue|async|await)\b/;

const COMMON: Rule[] = [
  { re: /\/\/[^\n]*/g, cls: "hl-cmt" },
  { re: /#[^\n]*/g, cls: "hl-cmt" },
  { re: /\/\*[\s\S]*?\*\//g, cls: "hl-cmt" },
  { re: /"""[\s\S]*?"""/g, cls: "hl-str" },
  { re: /'''[\s\S]*?'''/g, cls: "hl-str" },
  { re: /"(?:\\.|[^"\\])*"/g, cls: "hl-str" },
  { re: /'(?:\\.|[^'\\])*'/g, cls: "hl-str" },
  { re: /`(?:\\.|[^`\\])*`/g, cls: "hl-str" },
  { re: /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/g, cls: "hl-num" },
];

export function highlight(code: string, language: string): string {
  const lang = language.toLowerCase();
  const rules: Rule[] = [...COMMON];
  if (["javascript", "typescript", "js", "ts", "jsx", "tsx"].includes(lang)) {
    rules.push(
      { re: JS_KW, cls: "hl-kw" },
      { re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: "hl-type" },
      { re: /\b([a-zA-Z_][\w]*)\s*(?=\()/g, cls: "hl-fn" },
    );
  } else if (["kotlin", "java"].includes(lang)) {
    rules.push(
      { re: KT_KW, cls: "hl-kw" },
      { re: /@[A-Za-z_]\w*/g, cls: "hl-type" },
      { re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: "hl-type" },
      { re: /\b([a-zA-Z_][\w]*)\s*(?=\()/g, cls: "hl-fn" },
    );
  } else if (lang === "python") {
    rules.push(
      { re: PY_KW, cls: "hl-kw" },
      { re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: "hl-type" },
      { re: /\b([a-zA-Z_][\w]*)\s*(?=\()/g, cls: "hl-fn" },
    );
  } else if (lang === "css") {
    rules.push(
      { re: /[.#]?[a-zA-Z][\w-]*(?=\s*\{)/g, cls: "hl-fn" },
      { re: /--[\w-]+/g, cls: "hl-type" },
    );
  } else if (lang === "html" || lang === "xml") {
    rules.push(
      { re: /<\/?[a-zA-Z][\w:-]*/g, cls: "hl-kw" },
      { re: /\b[\w:-]+(?==)/g, cls: "hl-type" },
    );
  } else if (lang === "json") {
    rules.push({ re: /"[^"]+"(?=\s*:)/g, cls: "hl-fn" });
  } else if (lang === "markdown") {
    rules.push(
      { re: /^#{1,6}.+$/gm, cls: "hl-kw" },
      { re: /`[^`]+`/g, cls: "hl-str" },
    );
  }
  return applyRules(code, rules);
}
