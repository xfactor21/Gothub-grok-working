import { useEffect } from "react";
import {
  Blocks,
  Folder,
  Hammer,
  Home,
  Settings,
  Smartphone,
  SquareTerminal,
  Workflow,
} from "lucide-react";
import { BuildPanel } from "./BuildPanel";
import { CommandPalette } from "./CommandPalette";
import { Dashboard } from "./Dashboard";
import { NativePanel } from "./NativePanel";
import { Projects } from "./Projects";
import { SettingsPanel } from "./SettingsPanel";
import { StatusDot, toneForBuild, toneForXero } from "./StatusDot";
import { Templates } from "./Templates";
import { TerminalPanel } from "./TerminalPanel";
import { Workspace } from "./Workspace";
import { ZipImportInput } from "./ZipImportButton";
import { useXide } from "@/lib/xide/store";
import type { View } from "@/lib/xide/types";

const NAV: { id: View; label: string; icon: typeof Home; mobile?: boolean }[] = [
  { id: "dashboard", label: "Home", icon: Home, mobile: true },
  { id: "projects", label: "Projects", icon: Folder, mobile: true },
  { id: "templates", label: "Templates", icon: Blocks },
  { id: "workspace", label: "Editor", icon: Workflow, mobile: true },
  { id: "terminal", label: "Terminal", icon: SquareTerminal, mobile: true },
  { id: "build", label: "Build", icon: Hammer },
  { id: "native", label: "Phone", icon: Smartphone },
  { id: "settings", label: "Settings", icon: Settings, mobile: true },
];

export function AppShell() {
  const view = useXide((s) => s.view);
  const setView = useXide((s) => s.setView);
  const status = useXide((s) => s.statusMessage);
  const xero = useXide((s) => s.xeroPhase);
  const build = useXide((s) => s.buildPhase);
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const togglePalette = useXide((s) => s.togglePalette);

  useEffect(() => {
    void Promise.resolve(useXide.persist.rehydrate()).then(() => {
      useXide.getState().markHydrated();
      useXide.getState().reindex();
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
      if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useXide.getState().runBuild();
      }
      if (meta && e.key === "`") {
        e.preventDefault();
        setView("terminal");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, togglePalette]);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg text-fg">
      <ZipImportInput />
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Mark />
          <div className="min-w-0">
            <p className="text-[13px] font-medium tracking-tight">xIDE</p>
            <p className="truncate text-[11px] text-subtle">
              {project ? project.name : "No project"} · v9
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-4 md:flex">
          <StatusDot tone={toneForBuild(build)} label={status} />
          <StatusDot tone={toneForXero(xero)} label={`Xero ${xero}`} />
        </div>
        <button
          type="button"
          className="hidden h-8 rounded-sm border border-border px-2 text-[11px] text-muted md:inline"
          onClick={() => togglePalette(true)}
        >
          Command ⌘K
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          className="hidden w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border py-2 md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <NavBtn
              key={item.id}
              item={item}
              active={view === item.id}
              onClick={() => setView(item.id)}
            />
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-hidden pb-14 md:pb-0">
          {view === "dashboard" ? <Dashboard /> : null}
          {view === "projects" ? (
            <div className="h-full overflow-auto">
              <Projects />
            </div>
          ) : null}
          {view === "templates" ? (
            <div className="h-full overflow-auto">
              <Templates />
            </div>
          ) : null}
          {view === "workspace" ? <Workspace /> : null}
          {view === "terminal" ? <TerminalPanel /> : null}
          {view === "build" ? <BuildPanel /> : null}
          {view === "native" ? (
            <div className="h-full overflow-auto">
              <NativePanel />
            </div>
          ) : null}
          {view === "settings" ? (
            <div className="h-full overflow-auto">
              <SettingsPanel />
            </div>
          ) : null}
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-border bg-surface md:hidden"
        aria-label="Mobile"
      >
        {NAV.filter((n) => n.mobile).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${
              view === item.id ? "text-accent" : "text-muted"
            }`}
          >
            <item.icon className="size-5" />
            {item.label}
          </button>
        ))}
      </nav>
      <CommandPalette />
    </div>
  );
}

function NavBtn({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[60px] flex-col items-center gap-1 rounded-md py-2 text-[10px] ${
        active ? "bg-elevated text-fg" : "text-muted hover:text-fg"
      }`}
    >
      <Icon className="size-5" />
      {item.label}
    </button>
  );
}

function Mark() {
  return (
    <span
      className="flex size-8 items-center justify-center rounded-md bg-elevated font-mono text-sm text-accent shadow-[var(--shadow-border)]"
      aria-hidden
    >
      x
    </span>
  );
}
