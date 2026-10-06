import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import {
  fetchInstallStatus,
  probeCompileHost,
  startToolchainInstall,
  type InstallStatus,
} from "@/lib/xide/compile";
import { useXide } from "@/lib/xide/store";

const HOST_ZIP = "/xide-compile-host.zip";

export function SettingsPanel() {
  const settings = useXide((s) => s.settings);
  const update = useXide((s) => s.updateSettings);
  const [draft, setDraft] = useState(settings.compileHost ?? "");
  const [probe, setProbe] = useState<string>("Checking this machine…");
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<InstallStatus | null>(null);
  const [installErr, setInstallErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings.compileHost ?? "");
  }, [settings.compileHost]);

  useEffect(() => {
    let live = true;
    void probeCompileHost(settings.compileHost ?? "")
      .then((t) => {
        if (!live) return;
        const where = (settings.compileHost ?? "").trim() ? "Your computer" : "This machine";
        setProbe(
          t.labels.length
            ? `${where} · ${t.labels.join(" · ")}`
            : `${where} · no JDK/SDK yet`,
        );
      })
      .catch((err) => {
        if (!live) return;
        setProbe(err instanceof Error ? err.message : "Could not reach compile host");
      });
    return () => {
      live = false;
    };
  }, [settings.compileHost]);

  useEffect(() => {
    let live = true;
    void fetchInstallStatus("")
      .then((s) => {
        if (live) setInstall(s);
      })
      .catch((err) => {
        if (live) setInstallErr(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (install?.phase !== "running") return;
    const id = window.setInterval(() => {
      void fetchInstallStatus("")
        .then(setInstall)
        .catch((err) => setInstallErr(err instanceof Error ? err.message : String(err)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [install?.phase]);

  const saveHost = () => {
    update({ compileHost: draft.trim() });
  };

  const check = async () => {
    setBusy(true);
    try {
      const t = await probeCompileHost(draft.trim());
      const where = draft.trim() ? "Your computer" : "This machine";
      setProbe(
        t.labels.length
          ? `${where} · ${t.labels.join(" · ")}`
          : `${where} · no JDK/SDK yet`,
      );
      update({ compileHost: draft.trim() });
    } catch (err) {
      setProbe(err instanceof Error ? err.message : "Could not reach compile host");
    } finally {
      setBusy(false);
    }
  };

  const downloadSdk = async () => {
    setInstallErr(null);
    try {
      const s = await startToolchainInstall("");
      setInstall(s);
    } catch (err) {
      setInstallErr(err instanceof Error ? err.message : String(err));
    }
  };

  const ready =
    Boolean(install?.toolchain.androidSdk) &&
    Boolean(install?.toolchain.java) &&
    Boolean(install?.toolchain.gradle);
  const downloading = install?.phase === "running";
  const canInstall = install?.canInstall ?? false;

  return (
    <div className="mx-auto w-full max-w-xl p-4 md:p-8">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
        Preferences
      </p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight">Settings</h1>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Native phone app
        </p>
        <p className="text-sm leading-relaxed text-muted">
          This page is the website. To assemble APKs on a phone, install native
          xIDE — a real Android app, not a wrapper of this preview.
        </p>
        <button
          type="button"
          onClick={() => useXide.getState().setView("native")}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg"
        >
          <Smartphone className="size-3.5" />
          Get the phone app
        </button>
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Android SDK on this machine
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Not bundled. Tap Download SDK and this computer fetches JDK 17, Gradle,
          kotlinc, and Android SDK 35 — AIDE-style, no extra host. A phone
          browser still cannot assemble APKs.
        </p>
        {ready ? (
          <p className="text-sm text-ok">
            Already on this machine · {install?.toolchain.labels.join(" · ")}
          </p>
        ) : install?.installBlocked ? (
          <p className="text-sm text-warn">{install.installBlocked}</p>
        ) : (
          <p className="text-sm text-muted">
            Missing: {(install?.toolchain.missing ?? ["checking…"]).join(" · ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadSdk()}
            disabled={downloading || !canInstall}
            className="inline-flex h-11 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {downloading
              ? "Downloading…"
              : ready
                ? "Re-check SDK"
                : "Download SDK"}
          </button>
        </div>
        {installErr ? <p className="text-xs text-danger">{installErr}</p> : null}
        {install?.error && install.phase === "failed" ? (
          <p className="text-xs text-danger">{install.error}</p>
        ) : null}
        {install?.logs.length ? (
          <pre className="max-h-36 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">
            {install.logs.join("\n")}
          </pre>
        ) : null}
      </section>

      <div className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-4 text-sm">
          Editor size
          <input
            type="range"
            min={11}
            max={18}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            className="w-40 accent-[var(--color-accent)]"
          />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          Tab size
          <select
            value={settings.tabSize}
            onChange={(e) => update({ tabSize: Number(e.target.value) })}
            className="h-9 rounded-sm border border-border bg-bg px-2 text-sm"
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <Toggle
          label="Word wrap"
          on={settings.wordWrap}
          onChange={(v) => update({ wordWrap: v })}
        />
        <Toggle
          label="Autosave"
          on={settings.autosave}
          onChange={(v) => update({ autosave: v })}
        />
        <Toggle
          label="Xero agent"
          on={settings.xeroEnabled}
          onChange={(v) => update({ xeroEnabled: v })}
        />
      </div>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Optional: compile host
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Only needed if you edit on a phone and compile on a different PC.
          If you run this same xIDE on that PC, Download SDK above is enough —
          no extra host. The zip is a smaller compile-only process for that
          split setup.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={HOST_ZIP}
            download="xide-compile-host.zip"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"
          >
            <Download className="size-3.5" />
            Download host
          </a>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Unzip on the computer that will compile.</li>
          <li>
            Windows: double-click Start. Mac: Start.command. Needs Node.js LTS
            from nodejs.org.
          </li>
          <li>Copy an address from the status page into Compile URL below.</li>
          <li>Check host. Leave the host window running while you assemble.</li>
        </ol>
        <p className="text-xs leading-relaxed text-subtle">
          If Check host fails from a phone, open xIDE on the same computer that
          is running the host — some browsers block a phone from talking to a
          home PC.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Compile URL
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Blank uses this xIDE (the SDK on this machine). Paste a host address
          only if compile runs on a different computer.
        </p>
        <label className="block text-sm">
          Compile URL
          <input
            type="url"
            placeholder="blank = this machine"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveHost}
            className="mt-1 h-11 w-full rounded-sm border border-border bg-bg px-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void check()}
            disabled={busy}
            className="inline-flex h-11 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {busy ? "Checking…" : "Check host"}
          </button>
          {draft.trim() ? (
            <>
              <a
                href={draft.trim()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm"
              >
                Open host
              </a>
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  update({ compileHost: "" });
                }}
                className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm"
              >
                Use this machine
              </button>
            </>
          ) : null}
        </div>
        <p className="text-xs text-subtle">{probe}</p>
      </section>
      <p className="mt-4 text-xs text-subtle">
        xIDE v9 · workspace stored locally · no account required
      </p>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-10 rounded-full ${on ? "bg-accent" : "bg-elevated"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-fg transition-transform ${
            on ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
