import { FileArchive } from "lucide-react";
import { useXide } from "@/lib/xide/store";

export const ZIP_IMPORT_INPUT_ID = "xide-zip-import";

export function triggerZipImport() {
  const el = document.getElementById(ZIP_IMPORT_INPUT_ID);
  if (el instanceof HTMLInputElement) el.click();
}

export async function importZipFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return useXide.getState().importZip(bytes, file.name);
}

export function ZipImportInput() {
  return (
    <input
      id={ZIP_IMPORT_INPUT_ID}
      type="file"
      accept=".zip,application/zip"
      tabIndex={-1}
      aria-hidden="true"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        void importZipFile(file);
      }}
    />
  );
}

export function ZipImportButton() {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-fg"
      onClick={triggerZipImport}
    >
      <FileArchive className="size-4 text-accent" />
      Import zip
    </button>
  );
}
