import { currentLayoutProfile, layoutEditing } from "./layout-config.js?v=owner-layout-v1";

if (layoutEditing) {
  const toolbar = document.createElement("div");
  toolbar.className = "layout-editor";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "Local layout editor");
  toolbar.innerHTML = `
    <span class="layout-editor__profile"></span>
    <button type="button" data-save-layout>SAVE</button>
    <button type="button" data-discard-layout>DISCARD</button>
    <span class="layout-editor__status" role="status" aria-live="polite"></span>
  `;
  document.body.appendChild(toolbar);

  const profileLabel = toolbar.querySelector(".layout-editor__profile");
  const status = toolbar.querySelector(".layout-editor__status");
  const saveButton = toolbar.querySelector("[data-save-layout]");
  const profile = () => currentLayoutProfile();
  const updateProfileLabel = () => {
    profileLabel.textContent = `EDIT ${profile().toUpperCase()}`;
  };
  updateProfileLabel();
  window.addEventListener("resize", updateProfileLabel);

  const ratio = (value, maximum) =>
    Math.min(1, Math.max(0, maximum > 0 ? value / maximum : 0));

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    status.textContent = "SAVING…";
    try {
      const shortcuts = {};
      document.querySelectorAll(".desktop-shortcut").forEach((shortcut) => {
        const position = shortcut._desktopPosition;
        if (!position) throw new Error("Shortcuts are not ready yet");
        shortcuts[shortcut.dataset.appId] = {
          x: ratio(position.x, window.innerWidth - shortcut.offsetWidth - 12),
          y: ratio(position.y, window.innerHeight - shortcut.offsetHeight - 40)
        };
      });
      const poster = document.querySelector("[data-desktop-poster]");
      const position = poster?._posterPosition;
      if (!position) throw new Error("Poster is not ready yet");
      const payload = {
        profile: profile(),
        shortcuts,
        poster: {
          x: ratio(position.x, window.innerWidth - poster.offsetWidth - 12),
          y: ratio(position.y, window.innerHeight - poster.offsetHeight - 40)
        }
      };
      const response = await fetch("/__layout/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GTC-Layout-Editor": "1"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || "Save failed");
      status.textContent = `${profile().toUpperCase()} SAVED — SYNC TO PUBLISH`;
    } catch (error) {
      status.textContent = error.message || "SAVE FAILED";
    } finally {
      saveButton.disabled = false;
    }
  });

  toolbar.querySelector("[data-discard-layout]").addEventListener("click", () => {
    window.location.reload();
  });
}
