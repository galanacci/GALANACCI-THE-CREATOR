import { test, expect } from "./fixtures/test.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("local save writes only the selected published layout", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Server contract needs one run");
  const root = mkdtempSync(join(tmpdir(), "gtc-layout-test-"));
  const configPath = join(root, "js", "desktop-layout.json");
  mkdirSync(join(root, "js"));
  writeFileSync(configPath, '{"desktop":{},"mobile":{}}\n');

  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const serverPath = fileURLToPath(new URL("./support/static-server.mjs", import.meta.url));
  const server = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...process.env, PORT: String(port), GTC_LAYOUT_EDITOR: "1" },
    stdio: "ignore"
  });
  const origin = `http://127.0.0.1:${port}`;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        ready = (await fetch(`${origin}/__layout/status`)).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ready).toBe(true);

    const payload = {
      profile: "mobile",
      shortcuts: {
        "pog-exe": { x: .1, y: .5 },
        "experiments-folder": { x: .1, y: .7 },
        "ss-folder": { x: .1, y: .9 }
      },
      poster: { x: .9, y: .1 }
    };
    const rejected = await fetch(`${origin}/__layout/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://example.com",
        "X-GTC-Layout-Editor": "1" },
      body: JSON.stringify(payload)
    });
    expect(rejected.status).toBe(403);

    const saved = await fetch(`${origin}/__layout/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin,
        "X-GTC-Layout-Editor": "1" },
      body: JSON.stringify(payload)
    });
    expect(saved.status).toBe(200);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.desktop).toEqual({});
    expect(config.mobile.shortcuts["pog-exe"]).toEqual(payload.shortcuts["pog-exe"]);
    expect(config.mobile.poster).toEqual(payload.poster);
  } finally {
    await new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
      server.kill("SIGKILL");
    });
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
