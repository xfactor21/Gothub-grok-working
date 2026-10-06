#!/usr/bin/env node
import http from "node:http";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { compileProject, describeToolchain } from "./compile.mjs";

const PORT = Number(process.env.PORT || 8787);
const BIND = process.env.BIND || "0.0.0.0";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
  "access-control-max-age": "86400",
};

function lanUrls(port) {
  const urls = [];
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...CORS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function htmlPage(port) {
  const probe = describeToolchain();
  const local = `http://127.0.0.1:${port}`;
  const lan = lanUrls(port);
  const tools = probe.labels.length ? probe.labels.join(" · ") : "Toolchain not installed yet — run setup";
  const lanBlock = lan.length
    ? lan
        .map(
          (u) =>
            `<button class="addr" data-url="${u}">${u}<span>This network — phone on the same Wi-Fi</span></button>`,
        )
        .join("")
    : `<p class="muted">No other network address yet.</p>`;
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>xIDE Compile Host</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 15px/1.5 "Segoe UI", system-ui, sans-serif; background: #0b0d10; color: #e8eaed; }
  main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 1.6rem; font-weight: 560; letter-spacing: -0.03em; margin: 0.2rem 0 0.5rem; }
  .kicker { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #6b7380; }
  .muted { color: #8b949e; }
  .card { border: 1px solid #232a33; background: #12161b; border-radius: 12px; padding: 1rem 1.1rem; margin-top: 1.1rem; }
  .addr { display: block; width: 100%; text-align: left; margin: 0.4rem 0; padding: 0.75rem 0.9rem; border-radius: 8px; border: 1px solid #232a33; background: #181e25; color: #5eead4; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; cursor: pointer; }
  .addr span { display: block; color: #6b7380; font-family: "Segoe UI", system-ui, sans-serif; font-size: 12px; margin-top: 0.25rem; }
  .ok { color: #7fd99a; }
  .warn { color: #e6c07b; }
  ol { padding-left: 1.2rem; }
  li { margin: 0.35rem 0; }
</style>
<main>
  <p class="kicker">xIDE</p>
  <h1>Compile host is running.</h1>
  <p class="muted">Leave this window open while you assemble APKs. Copy an address into xIDE → Settings → Compile URL.</p>
  <div class="card">
    <p class="kicker">Addresses</p>
    <button class="addr" data-url="${local}">${local}<span>This computer — xIDE open on this same machine</span></button>
    ${lanBlock}
  </div>
  <div class="card">
    <p class="kicker">Toolchain</p>
    <p class="${probe.androidSdk && probe.gradle && probe.java ? "ok" : "warn"}">${tools}</p>
  </div>
  <div class="card">
    <p class="kicker">In xIDE</p>
    <ol class="muted">
      <li>Open Settings.</li>
      <li>Paste an address above into Compile URL.</li>
      <li>Press Check host. You want OpenJDK, Gradle, and Android SDK 35 listed.</li>
      <li>Assemble APK as usual. Keep this host running.</li>
    </ol>
  </div>
  <p class="muted" style="margin-top:1.4rem;font-size:12px">If Check host fails the first time, open this page from xIDE’s “Open host” link so the browser allows it, then check again.</p>
</main>
<script>
  document.querySelectorAll(".addr").forEach((b) => {
    b.addEventListener("click", async () => {
      const u = b.getAttribute("data-url");
      try { await navigator.clipboard.writeText(u); b.querySelector("span").textContent = "Copied — paste into xIDE Settings"; }
      catch { prompt("Copy this address", u); }
    });
  });
</script>
</html>`;
}

function openBrowser(url) {
  try {
    let child;
    if (process.platform === "win32") {
      child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
    } else if (process.platform === "darwin") {
      child = spawn("open", [url], { stdio: "ignore", detached: true });
    } else {
      child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    }
    child?.on("error", () => {});
    child?.unref?.();
  } catch {
    /* headless hosts have no browser — that is fine */
  }
}

async function readJson(req, max = 12_000_000) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new Error("Request too large");
    chunks.push(c);
  }
  if (!n) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  try {
    if (url.pathname === "/api/compile" && req.method === "GET") {
      json(res, describeToolchain());
      return;
    }
    if (url.pathname === "/api/compile" && req.method === "POST") {
      const body = await readJson(req);
      if (!body || typeof body !== "object" || !body.files || typeof body.files !== "object") {
        json(res, { error: "Expected { projectName, templateId, files, run }" }, 400);
        return;
      }
      const result = await compileProject({
        projectName: String(body.projectName ?? "app"),
        templateId: String(body.templateId ?? "empty"),
        files: Object.fromEntries(
          Object.entries(body.files)
            .slice(0, 120)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, String(v)]),
        ),
        run: Boolean(body.run),
      });
      json(res, result);
      return;
    }
    if (url.pathname === "/" && req.method === "GET") {
      const body = htmlPage(PORT);
      res.writeHead(200, { ...CORS, "content-type": "text/html; charset=utf-8" });
      res.end(body);
      return;
    }
    json(res, { error: "Not found" }, 404);
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORT, BIND, () => {
  const local = `http://127.0.0.1:${PORT}`;
  const probe = describeToolchain();
  console.log("");
  console.log("xIDE Compile Host is running.");
  console.log(`This computer:  ${local}`);
  for (const u of lanUrls(PORT)) console.log(`This network:   ${u}`);
  console.log(`Toolchain:      ${probe.labels.join(" · ") || "not installed — run setup"}`);
  console.log("");
  console.log("Paste an address into xIDE → Settings → Compile URL");
  console.log("Leave this window open while you compile.");
  console.log("");
  openBrowser(local);
});
