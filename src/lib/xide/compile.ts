import { createServerFn } from "@tanstack/react-start";

export type CompileInput = {
  projectName: string;
  templateId: string;
  files: Record<string, string>;
  run: boolean;
};

export type CompileDiagnostic = {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
};

export type CompileArtifact = {
  name: string;
  mime: string;
  base64: string;
};

export type CompileResult = {
  ok: boolean;
  skipped?: string;
  logs: { level: "info" | "warn" | "error" | "ok"; text: string }[];
  diagnostics: CompileDiagnostic[];
  artifacts: CompileArtifact[];
  stdout: string[];
  stderr: string[];
  toolchain: string[];
};

export type ToolchainProbe = {
  java: boolean;
  kotlinc: boolean;
  gradle: boolean;
  androidSdk: boolean;
  labels: string[];
  canInstall?: boolean;
  installBlocked?: string;
  missing?: string[];
};

export type InstallPhase = "idle" | "running" | "success" | "failed";

export type InstallStatus = {
  phase: InstallPhase;
  logs: string[];
  error?: string;
  toolchain: ToolchainProbe;
  canInstall: boolean;
  installBlocked?: string;
};

export const compileWorkspace = createServerFn({ method: "POST" })
  .validator((input: CompileInput) => input)
  .handler(async ({ data }): Promise<CompileResult> => {
    const { compileProject } = await import("./toolchain.server");
    return compileProject(data);
  });

export const probeToolchain = createServerFn({ method: "GET" }).handler(
  async (): Promise<ToolchainProbe> => {
    const { describeToolchain } = await import("./toolchain.server");
    return describeToolchain();
  },
);

export function normalizeCompileHost(raw: string): string | null {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export async function compileProjectFiles(
  input: CompileInput,
  compileHost: string,
): Promise<CompileResult> {
  const host = normalizeCompileHost(compileHost);
  if (!host) return compileWorkspace({ data: input });
  const res = await fetch(`${host}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Compile host ${host} returned ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`,
    );
  }
  return (await res.json()) as CompileResult;
}

export async function probeCompileHost(compileHost: string): Promise<ToolchainProbe> {
  const host = normalizeCompileHost(compileHost);
  if (!host) return probeToolchain();
  const res = await fetch(`${host}/api/compile`, { method: "GET" });
  if (!res.ok) throw new Error(`Compile host returned ${res.status}`);
  return (await res.json()) as ToolchainProbe;
}

function toolchainUrl(compileHost: string): string {
  const host = normalizeCompileHost(compileHost);
  return host ? `${host}/api/toolchain` : "/api/toolchain";
}

export async function fetchInstallStatus(compileHost: string): Promise<InstallStatus> {
  const res = await fetch(toolchainUrl(compileHost), { method: "GET" });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "That compile host has no Download SDK endpoint — start it so first-run setup can install the SDK."
        : `Toolchain status returned ${res.status}`,
    );
  }
  return (await res.json()) as InstallStatus;
}

export async function startToolchainInstall(compileHost: string): Promise<InstallStatus> {
  const res = await fetch(toolchainUrl(compileHost), { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 404
        ? "That compile host has no Download SDK endpoint — start it so first-run setup can install the SDK."
        : `Download SDK failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
    );
  }
  return (await res.json()) as InstallStatus;
}
