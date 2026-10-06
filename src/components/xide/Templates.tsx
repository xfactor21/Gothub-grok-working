import { useState } from "react";
import { TEMPLATES } from "@/lib/xide/templates";
import type { TemplateId } from "@/lib/xide/types";
import { useXide } from "@/lib/xide/store";

export function Templates() {
  const createProject = useXide((s) => s.createProject);
  const [picked, setPicked] = useState<TemplateId>("kotlin-jvm");
  const [name, setName] = useState("Pulse");
  const meta = TEMPLATES.find((t) => t.id === picked);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
        Template engine
      </p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight">New project</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Templates write a real file tree. Kotlin JVM and Java compile and run on
        this host with JDK 17, kotlinc 2.1.10, and Gradle 8.12. Android projects
        compile with Gradle assembleDebug against the Android SDK (API 35) and download the debug APK.
        Web previews from your HTML; Node runs in a sandbox. Already have source?
        Import a zip from Projects.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => {
          const on = t.id === picked;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              className={`rounded-lg border p-4 text-left ${
                on
                  ? "border-accent/50 bg-elevated"
                  : "border-border bg-surface hover:shadow-[var(--shadow-border-hover)]"
              }`}
            >
              <p className="text-sm font-medium text-fg">{t.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t.description}
              </p>
              <p className="mt-3 text-[11px] text-subtle">v{t.version}</p>
            </button>
          );
        })}
      </div>
      <form
        className="mt-8 flex max-w-lg flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          createProject(name, picked);
        }}
      >
        <label className="flex-1 text-xs text-muted">
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus:shadow-[var(--shadow-border-hover)]"
          />
        </label>
        <button
          type="submit"
          className="h-11 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg"
        >
          Create {meta?.name}
        </button>
      </form>
    </div>
  );
}
