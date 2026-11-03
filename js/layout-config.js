const localHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const requestedEditor = localHost && new URLSearchParams(window.location.search).get("layout") === "edit";

async function readJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (response.ok) return await response.json();
  } catch {
  } finally {
    window.clearTimeout(timeout);
  }
  return null;
}

const [published, editorStatus] = await Promise.all([
  readJson(new URL("./desktop-layout.json", import.meta.url)),
  requestedEditor ? readJson("/__layout/status") : Promise.resolve(null)
]);

export const desktopLayout = published || { desktop: {}, mobile: {} };
export const layoutEditing = requestedEditor && editorStatus?.editor === true;

if (layoutEditing) document.documentElement.classList.add("layout-editing");

export function currentLayoutProfile() {
  return window.innerWidth <= 700 ? "mobile" : "desktop";
}

export function publishedPosition(kind, id, maxX, maxY) {
  const profile = desktopLayout[currentLayoutProfile()] || {};
  const position = kind === "poster" ? profile.poster : profile.shortcuts?.[id];
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
  return {
    x: Math.round(position.x * maxX),
    y: Math.round(position.y * maxY)
  };
}
