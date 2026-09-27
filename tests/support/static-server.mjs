import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const layoutEditorEnabled = process.env.GTC_LAYOUT_EDITOR === "1";
const layoutFile = resolve(root, "js", "desktop-layout.json");
const shortcutIds = ["pog-exe", "experiments-folder", "ss-folder"];

function validPosition(position) {
  return position && ["x", "y"].every((axis) =>
    typeof position[axis] === "number" &&
    Number.isFinite(position[axis]) &&
    position[axis] >= 0 && position[axis] <= 1
  );
}

async function saveLayout(request, response) {
  const expectedOrigin = `http://${request.headers.host}`;
  const validHost = ["127.0.0.1", "localhost"].some((host) =>
    request.headers.host === `${host}:${port}`
  );
  if (!validHost || request.headers.origin !== expectedOrigin ||
      request.headers["x-gtc-layout-editor"] !== "1") {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 8192) throw new Error("Layout payload is too large");
    }
    const incoming = JSON.parse(body);
    const valid = ["desktop", "mobile"].includes(incoming.profile) &&
      validPosition(incoming.poster) &&
      incoming.shortcuts &&
      shortcutIds.every((id) => validPosition(incoming.shortcuts[id]));
    if (!valid) throw new Error("Invalid layout");

    const current = JSON.parse(readFileSync(layoutFile, "utf8"));
    current[incoming.profile] = {
      shortcuts: Object.fromEntries(shortcutIds.map((id) => [id, incoming.shortcuts[id]])),
      poster: incoming.poster
    };
    writeFileSync(layoutFile, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ saved: true, profile: incoming.profile }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ saved: false, error: error.message }));
  }
}

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = normalize(join(root, decoded));
  const insideRoot = relative(root, requested);

  if (insideRoot.startsWith("..") || insideRoot.includes(":\\")) {
    return null;
  }

  try {
    return statSync(requested).isDirectory()
      ? join(requested, "index.html")
      : requested;
  } catch {
    return requested;
  }
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === "/__layout/status" && request.method === "GET") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ editor: layoutEditorEnabled }));
    return;
  }
  if (layoutEditorEnabled && pathname === "/__layout/save" && request.method === "POST") {
    void saveLayout(request, response);
    return;
  }
  const filePath = safePath(pathname === "/" ? "/index.html" : pathname);

  if (!filePath) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": stats.size,
      "Content-Type": types.get(extname(filePath).toLowerCase()) || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`GALANACCI OS test server: http://127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
