import type { BuildPhase, NodePhase, XeroPhase } from "@/lib/xide/types";

type Tone = "idle" | "busy" | "ok" | "warn" | "err";

const TONE: Record<Tone, string> = {
  idle: "bg-muted",
  busy: "bg-accent animate-[xide-pulse_1.2s_ease-in-out_infinite]",
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-danger",
};

export function StatusDot({
  tone,
  label,
}: {
  tone: Tone;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${TONE[tone]}`} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function toneForXero(p: XeroPhase): Tone {
  if (p === "thinking" || p === "working") return "busy";
  if (p === "success") return "ok";
  if (p === "warning") return "warn";
  if (p === "error") return "err";
  return "idle";
}

export function toneForBuild(p: BuildPhase): Tone {
  if (p === "running") return "busy";
  if (p === "success") return "ok";
  if (p === "cancelled") return "warn";
  if (p === "failed") return "err";
  return "idle";
}

export function toneForNode(p: NodePhase): Tone {
  if (p === "starting") return "busy";
  if (p === "running") return "ok";
  if (p === "failed") return "err";
  if (p === "stopped") return "warn";
  return "idle";
}
