import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

const APK = "/xide-native.apk";

export function NativePanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const check = () => {
      void fetch(APK, { method: "HEAD", cache: "no-store" })
        .then((r) => {
          if (!live) return;
          setReady(r.ok);
          const len = r.headers.get("content-length");
          setBytes(len ? Number(len) : null);
        })
        .catch(() => {
          if (live) setReady(false);
        });
    };
    check();
    const id = window.setInterval(check, 4000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const size =
    bytes && bytes > 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : bytes
        ? `${Math.round(bytes / 1024)} KB`
        : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-auto p-4 md:p-8">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">
        Phone
      </p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight">xIDE native</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This preview is still a website. A website cannot compile Android on
        your phone. Native xIDE is a real Android app you install — then
        Download SDK and Assemble run on the device, like AIDE.
      </p>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Install on your phone
        </p>
        {ready ? (
          <p className="text-sm text-ok">
            APK ready{size ? ` · ${size}` : ""}. Debug build, not Play Store.
          </p>
        ) : ready === false ? (
          <p className="text-sm text-warn">
            APK is still assembling. Stay on this page — the download appears
            when it is ready.
          </p>
        ) : (
          <p className="text-sm text-muted">Checking for the APK…</p>
        )}
        {ready ? (
          <a
            href={APK}
            download="xide-native.apk"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            <Download className="size-4" />
            Download xIDE.apk
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg opacity-40"
          >
            <Smartphone className="size-4" />
            Assembling…
          </button>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open the APK on an ARM64 Android phone (API 26+).</li>
          <li>Allow install from this source if Android asks.</li>
          <li>In xIDE: Settings → Download SDK. About 3 GB, Wi-Fi.</li>
          <li>Create an Android project, then Assemble. First Gradle run needs Wi-Fi for Maven.</li>
          <li>Install APK from the Build screen when Gradle finishes.</li>
        </ol>
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-[11px] tracking-[0.14em] text-subtle uppercase">
          Honest limits
        </p>
        <ul className="space-y-2 text-sm text-muted">
          <li>ARM64 phones only. No on-device JDK for x86 emulators.</li>
          <li>
            User apps assemble with JDK 11, Gradle 7.6.4, AGP 7.4.2, compileSdk
            33 — the combination that actually runs on Android without Termux.
          </li>
          <li>Debug APKs only. No Play signing, no release keystore.</li>
          <li>
            This website still edits in the browser. Sideload the native app to
            compile on the phone.
          </li>
        </ul>
      </section>
    </div>
  );
}
