/** Store-method ZIP (no compression) plus a real unzip for import. */

import { languageForPath } from "./templates";
import type { ProjectFile, TemplateId } from "./types";

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): { date: number; time: number } {
  const d = new Date(ms);
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    ((d.getMonth() + 1) << 5) |
    (d.getDate() & 0x1f);
  return { date, time };
}

export function zipFiles(
  files: Record<string, string>,
  mtime = Date.now(),
): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(mtime);
  const entries = Object.entries(files)
    .map(([path, content]) => {
      const name = enc.encode(path.replace(/^\/+/, ""));
      const data = enc.encode(content);
      return { name, data, crc: crc32(data), date, time };
    })
    .filter((e) => e.name.length > 0);

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.name.length + e.data.length;
    centralSize += 46 + e.name.length;
  }
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let o = 0;
  const localOffsets: number[] = [];

  for (const e of entries) {
    localOffsets.push(o);
    view.setUint32(o, 0x04034b50, true);
    o += 4;
    view.setUint16(o, 20, true);
    o += 2;
    view.setUint16(o, 0x0800, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint16(o, e.time, true);
    o += 2;
    view.setUint16(o, e.date, true);
    o += 2;
    view.setUint32(o, e.crc, true);
    o += 4;
    view.setUint32(o, e.data.length, true);
    o += 4;
    view.setUint32(o, e.data.length, true);
    o += 4;
    view.setUint16(o, e.name.length, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    out.set(e.name, o);
    o += e.name.length;
    out.set(e.data, o);
    o += e.data.length;
  }

  const centralStart = o;
  entries.forEach((e, i) => {
    view.setUint32(o, 0x02014b50, true);
    o += 4;
    view.setUint16(o, 20, true);
    o += 2;
    view.setUint16(o, 20, true);
    o += 2;
    view.setUint16(o, 0x0800, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint16(o, e.time, true);
    o += 2;
    view.setUint16(o, e.date, true);
    o += 2;
    view.setUint32(o, e.crc, true);
    o += 4;
    view.setUint32(o, e.data.length, true);
    o += 4;
    view.setUint32(o, e.data.length, true);
    o += 4;
    view.setUint16(o, e.name.length, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint16(o, 0, true);
    o += 2;
    view.setUint32(o, 0, true);
    o += 4;
    view.setUint32(o, localOffsets[i]!, true);
    o += 4;
    out.set(e.name, o);
    o += e.name.length;
  });

  const centralLen = o - centralStart;
  view.setUint32(o, 0x06054b50, true);
  o += 4;
  view.setUint16(o, 0, true);
  o += 2;
  view.setUint16(o, 0, true);
  o += 2;
  view.setUint16(o, entries.length, true);
  o += 2;
  view.setUint16(o, entries.length, true);
  o += 2;
  view.setUint32(o, centralLen, true);
  o += 4;
  view.setUint32(o, centralStart, true);
  o += 4;
  view.setUint16(o, 0, true);
  o += 2;
  return out.subarray(0, o);
}

export function safeZipName(name: string): string {
  return `${name.trim().replace(/[^\w.-]+/g, "-") || "project"}.zip`;
}

export const ZIP_IMPORT_LIMITS = {
  maxZipBytes: 40 * 1024 * 1024,
  maxFiles: 200,
  maxFileBytes: 400 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
};

const BIN_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "pdf",
  "so",
  "dll",
  "exe",
  "dylib",
  "a",
  "o",
  "class",
  "dex",
  "apk",
  "aab",
  "jar",
  "aar",
  "zip",
  "7z",
  "rar",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "mp4",
  "webm",
  "ogg",
  "wav",
  "bin",
  "keystore",
  "jks",
  "webp",
  "proto",
  "pb",
]);

const SOURCE_EXT = new Set([
  "kt",
  "kts",
  "java",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "html",
  "css",
  "py",
  "xml",
  "md",
  "json",
  "gradle",
  "properties",
  "toml",
  "txt",
  "sh",
  "svg",
  "pro",
]);

const KEEP_ROOT = new Set([
  "src",
  "app",
  "lib",
  "java",
  "kotlin",
  "res",
  "main",
  "test",
  "android",
  "ios",
  "web",
  "public",
  "assets",
  "include",
]);

const SKIP_DIR = new Set([
  "__macosx",
  ".git",
  "node_modules",
  ".gradle",
  ".idea",
  "build",
  ".cxx",
  "captures",
  "lint",
  ".svn",
  ".hg",
  "dist",
  "out",
  "target",
  ".next",
]);

export type ZipSkipCounts = {
  junk: number;
  binary: number;
  cap: number;
  encrypted: number;
  oversized: number;
  corrupt: number;
  unsupported: number;
};

export type ZipProjectImport = {
  files: Record<string, ProjectFile>;
  name: string;
  templateId: TemplateId;
  skipped: ZipSkipCounts;
};

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function findEocd(buf: Uint8Array): number {
  const view = dv(buf);
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const commentLen = view.getUint16(i + 20, true);
    if (i + 22 + commentLen <= buf.length) return i;
  }
  throw new Error("That file is not a zip (missing central directory)");
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot inflate compressed zip entries");
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function sanitizePath(raw: string): string | null {
  const n = raw.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!n || n.endsWith("/")) return null;
  const parts = n.split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p === ".")) return null;
  if (parts.length === 0) return null;
  return parts.join("/");
}

function isJunkPath(path: string): boolean {
  const segs = path.split("/");
  const base = segs[segs.length - 1] ?? "";
  if (!base || base === ".DS_Store" || base === "Thumbs.db" || base === "desktop.ini") {
    return true;
  }
  if (base.startsWith("._") || base.endsWith("~")) return true;
  if (base === "gradle-wrapper.jar") return true;
  for (const s of segs.slice(0, -1)) {
    const low = s.toLowerCase();
    if (SKIP_DIR.has(low)) return true;
    if (low.startsWith(".") && low !== ".github") return true;
  }
  return false;
}

function extOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

function looksBinary(data: Uint8Array, path: string): boolean {
  if (BIN_EXT.has(extOf(path))) return true;
  const n = Math.min(data.length, 800);
  for (let i = 0; i < n; i++) if (data[i] === 0) return true;
  return false;
}

function isSourcePath(path: string): boolean {
  const ext = extOf(path);
  if (SOURCE_EXT.has(ext)) return true;
  const base = path.split("/").pop() ?? "";
  return (
    base === "Dockerfile" ||
    base === "Makefile" ||
    base === "LICENSE" ||
    base === "NOTICE" ||
    base.startsWith("gradlew")
  );
}

function stripCommonRoot(paths: string[]): { root: string | null; map: (p: string) => string } {
  if (paths.length === 0) return { root: null, map: (p) => p };
  const first = paths[0]!.split("/")[0]!;
  const allNested = paths.every((p) => p === first || p.startsWith(first + "/"));
  const hasTopFile = paths.some((p) => !p.includes("/"));
  if (!allNested || hasTopFile) return { root: null, map: (p) => p };
  if (KEEP_ROOT.has(first.toLowerCase())) return { root: null, map: (p) => p };
  const prefix = first + "/";
  return {
    root: first,
    map: (p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p),
  };
}

export function guessTemplate(files: Record<string, string>): TemplateId {
  const keys = Object.keys(files);
  const hasPath = (re: RegExp) => keys.some((k) => re.test(k));
  const gradleText = keys
    .filter((k) => /build\.gradle(\.kts)?$/i.test(k) || /settings\.gradle(\.kts)?$/i.test(k))
    .map((k) => files[k] ?? "")
    .join("\n");
  if (
    hasPath(/AndroidManifest\.xml$/i) ||
    /com\.android\.(application|library)/.test(gradleText) ||
    /id\("com\.android\./.test(gradleText)
  ) {
    return "android-compose";
  }
  if (hasPath(/\.kt$/) && hasPath(/build\.gradle(\.kts)?$/)) return "kotlin-jvm";
  if (hasPath(/\.java$/) && hasPath(/build\.gradle(\.kts)?$/)) return "java";
  if (hasPath(/(^|\/)index\.html$/i) || hasPath(/\.html$/i)) return "web-app";
  if (hasPath(/\.py$/)) return "python";
  if (hasPath(/(^|\/)package\.json$/) || hasPath(/(^|\/)index\.js$/)) return "node-script";
  if (hasPath(/\.kt$/)) return "kotlin-jvm";
  if (hasPath(/\.java$/)) return "java";
  return "empty";
}

function guessName(zipName: string, root: string | null): string {
  const fromZip = zipName
    .replace(/\.zip$/i, "")
    .replace(/[^\w.+ -]+/g, "")
    .trim();
  const low = fromZip.toLowerCase();
  if (fromZip && low !== "archive" && low !== "download" && low !== "project") {
    return fromZip.slice(0, 60);
  }
  if (root) return root.slice(0, 60);
  return "Imported";
}

export async function unzipEntries(
  buf: Uint8Array,
): Promise<{ path: string; data: Uint8Array; encrypted: boolean; method: number }[]> {
  if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error("That file is not a zip");
  }
  const view = dv(buf);
  const eocd = findEocd(buf);
  const diskEntries = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (diskEntries === 0xffff || totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported");
  }
  const out: { path: string; data: Uint8Array; encrypted: boolean; method: number }[] = [];
  let o = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let i = 0; i < totalEntries; i++) {
    if (o + 46 > buf.length || o + 46 > cdEnd) break;
    if (view.getUint32(o, true) !== 0x02014b50) {
      throw new Error("Zip central directory is corrupt");
    }
    const flags = view.getUint16(o + 8, true);
    const method = view.getUint16(o + 10, true);
    const crc = view.getUint32(o + 16, true);
    const compSize = view.getUint32(o + 20, true);
    const uncompSize = view.getUint32(o + 24, true);
    const nameLen = view.getUint16(o + 28, true);
    const extraLen = view.getUint16(o + 30, true);
    const commentLen = view.getUint16(o + 32, true);
    const localOff = view.getUint32(o + 42, true);
    const nameBytes = buf.subarray(o + 46, o + 46 + nameLen);
    const utf8 = (flags & 0x0800) !== 0;
    const rawName = decodeName(nameBytes, utf8);
    o += 46 + nameLen + extraLen + commentLen;
    const encrypted = (flags & 1) !== 0;
    const path = sanitizePath(rawName);
    if (!path) continue;
    if (encrypted) {
      out.push({ path, data: new Uint8Array(0), encrypted: true, method });
      continue;
    }
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOff === 0xffffffff) {
      throw new Error("ZIP64 archives are not supported");
    }
    if (localOff + 30 > buf.length) continue;
    if (view.getUint32(localOff, true) !== 0x04034b50) continue;
    const locName = view.getUint16(localOff + 26, true);
    const locExtra = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + locName + locExtra;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) continue;
    const compressed = buf.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (method === 0) {
      data = compressed.slice();
    } else if (method === 8) {
      try {
        data = await inflateRaw(compressed);
      } catch {
        out.push({ path, data: new Uint8Array(0), encrypted: false, method: -8 });
        continue;
      }
    } else {
      out.push({ path, data: new Uint8Array(0), encrypted: false, method });
      continue;
    }
    if (uncompSize && data.length !== uncompSize) {
      out.push({ path, data: new Uint8Array(0), encrypted: false, method: -1 });
      continue;
    }
    if (crc && crc32(data) !== crc) {
      out.push({ path, data: new Uint8Array(0), encrypted: false, method: -1 });
      continue;
    }
    out.push({ path, data, encrypted: false, method });
  }
  return out;
}

export async function projectFilesFromZip(
  bytes: Uint8Array,
  zipName = "project.zip",
): Promise<ZipProjectImport> {
  if (bytes.byteLength > ZIP_IMPORT_LIMITS.maxZipBytes) {
    throw new Error(
      `Zip is larger than ${Math.round(ZIP_IMPORT_LIMITS.maxZipBytes / (1024 * 1024))} MB`,
    );
  }
  const skipped: ZipSkipCounts = {
    junk: 0,
    binary: 0,
    cap: 0,
    encrypted: 0,
    oversized: 0,
    corrupt: 0,
    unsupported: 0,
  };
  const entries = await unzipEntries(bytes);
  const eligible: { path: string; text: string; source: boolean }[] = [];
  for (const e of entries) {
    if (e.encrypted) {
      skipped.encrypted += 1;
      continue;
    }
    if (e.method === -1 || e.method === -8) {
      skipped.corrupt += 1;
      continue;
    }
    if (e.method !== 0 && e.method !== 8) {
      skipped.unsupported += 1;
      continue;
    }
    if (isJunkPath(e.path)) {
      skipped.junk += 1;
      continue;
    }
    if (looksBinary(e.data, e.path)) {
      skipped.binary += 1;
      continue;
    }
    if (e.data.byteLength > ZIP_IMPORT_LIMITS.maxFileBytes) {
      skipped.oversized += 1;
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(e.data);
    } catch {
      skipped.binary += 1;
      continue;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    eligible.push({ path: e.path, text, source: isSourcePath(e.path) });
  }

  eligible.sort((a, b) => {
    if (a.source !== b.source) return a.source ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  const picked: { path: string; text: string }[] = [];
  let total = 0;
  for (const e of eligible) {
    if (picked.length >= ZIP_IMPORT_LIMITS.maxFiles) {
      skipped.cap += 1;
      continue;
    }
    if (total + e.text.length > ZIP_IMPORT_LIMITS.maxTotalBytes) {
      skipped.oversized += 1;
      continue;
    }
    picked.push({ path: e.path, text: e.text });
    total += e.text.length;
  }

  const strip = stripCommonRoot(picked.map((p) => p.path));
  const files: Record<string, string> = {};
  for (const p of picked) {
    const path = strip.map(p.path);
    if (!path) continue;
    files[path] = p.text;
  }

  const projectFiles: Record<string, ProjectFile> = {};
  for (const [path, content] of Object.entries(files)) {
    projectFiles[path] = { content, language: languageForPath(path) };
  }

  return {
    files: projectFiles,
    name: guessName(zipName, strip.root),
    templateId: guessTemplate(files),
    skipped,
  };
}

export function describeZipSkips(skipped: ZipSkipCounts): string {
  const bits: string[] = [];
  if (skipped.junk) bits.push(`${skipped.junk} generated`);
  if (skipped.binary) bits.push(`${skipped.binary} binary`);
  if (skipped.encrypted) bits.push(`${skipped.encrypted} encrypted`);
  if (skipped.unsupported) bits.push(`${skipped.unsupported} compressed with an unsupported method`);
  if (skipped.corrupt) bits.push(`${skipped.corrupt} corrupt`);
  if (skipped.oversized) bits.push(`${skipped.oversized} too large`);
  if (skipped.cap) bits.push(`${skipped.cap} over the ${ZIP_IMPORT_LIMITS.maxFiles}-file limit`);
  return bits.join(" · ");
}
