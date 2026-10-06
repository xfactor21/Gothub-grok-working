export type View =
  | "dashboard"
  | "projects"
  | "templates"
  | "workspace"
  | "terminal"
  | "build"
  | "native"
  | "settings";

export type TemplateId =
  | "android-compose"
  | "kotlin-jvm"
  | "java"
  | "web-app"
  | "node-script"
  | "python"
  | "empty";

export type Severity = "error" | "warning" | "info";

export type BuildPhase =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type NodePhase = "not_started" | "starting" | "running" | "stopped" | "failed";

export type XeroPhase = "idle" | "thinking" | "working" | "success" | "warning" | "error";

export interface ProjectFile {
  content: string;
  language: string;
}

export interface Project {
  id: string;
  name: string;
  templateId: TemplateId;
  createdAt: number;
  updatedAt: number;
  files: Record<string, ProjectFile>;
  folders: string[];
}

export interface Diagnostic {
  id: string;
  file: string;
  line: number;
  col: number;
  severity: Severity;
  message: string;
  source: "compiler" | "linter" | "indexer";
}

export interface SymbolHit {
  name: string;
  kind: "class" | "function" | "interface" | "property" | "const";
  file: string;
  line: number;
}

export interface BuildLogLine {
  id: string;
  ts: number;
  level: "info" | "warn" | "error" | "ok";
  text: string;
}

export interface Artifact {
  name: string;
  kind: "zip" | "preview" | "output" | "jar" | "apk";
  sizeLabel: string;
  path: string;
  href?: string;
}


export interface PatchProposal {
  path: string;
  content: string;
  original: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "xero" | "system";
  text: string;
  ts: number;
  patches?: PatchProposal[];
  approval?: "pending" | "approved" | "rejected";
}

export interface TermLine {
  id: string;
  kind: "in" | "out" | "err" | "sys";
  text: string;
}

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autosave: boolean;
  xeroEnabled: boolean;
  /** Empty = compile on this xIDE instance. Otherwise POST {url}/api/compile */
  compileHost: string;
}

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  version: string;
  languages: string[];
  requiredParameters: string[];
}
