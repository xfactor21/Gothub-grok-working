import { Download } from "lucide-react";

export function NativePanel() {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-auto p-4 md:p-8">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
        Phone
      </p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight">xIDE 9.01</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Install this over the copy already on the phone. Same package, so the
        SDK you already downloaded stays. The old build never reached Gradle:
        Android blocked java with permission denied.
      </p>
      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-ok">
          Debug APK built · version 9.01 · about 10 MB. Not a Play Store build.
        </p>
        <a
          href="/xIDE_v9.01_assemble-exec_Oct-13.apk"
          download="xIDE_v9.01_assemble-exec_Oct-13.apk"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          <Download className="size-4" />
          Download xIDE 9.01
        </a>
        <p className="text-xs leading-relaxed text-subtle">
          If the button does nothing in this preview, use the file attached in
          the chat. Google Drive is out of space, so there is no new Drive
          link.
        </p>
      </section>
    </div>
  );
}
