import { FOLDER_CATALOG } from "./folder-catalog.js?v=preview-cards-v1";

function cell(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("role", "cell");
  span.textContent = text;
  return span;
}

export function renderFolderCatalogs() {
  for (const [folder, entries] of Object.entries(FOLDER_CATALOG)) {
    const list = document.querySelector(`[data-folder-window="${folder}"] .app-list`);
    if (!list) continue;

    const rows = document.createDocumentFragment();
    for (const entry of entries) {
      const link = document.createElement("a");
      link.className = "app-list__row";
      link.setAttribute("data-app-link", "");
      link.dataset.appType = entry.type;
      if (entry.filterTypes) link.dataset.filterTypes = entry.filterTypes.join(" ");
      link.dataset.label = entry.label;
      link.setAttribute("href", entry.href);
      link.setAttribute("aria-label", entry.ariaLabel);
      link.setAttribute("role", "row");

      const name = document.createElement("span");
      name.className = "app-list__name";
      name.setAttribute("role", "cell");
      const preview = document.createElement("img");
      preview.className = "app-list__preview";
      preview.src = entry.preview;
      preview.alt = "";
      preview.loading = "lazy";
      preview.decoding = "async";
      preview.draggable = false;
      preview.addEventListener("error", () => {
        const fallback = `assets/share/${entry.shareSlug}.png`;
        if (!preview.src.endsWith(fallback)) preview.src = fallback;
      });
      const icon = document.createElement("img");
      icon.className = "app-list__file-icon";
      icon.src = "assets/icons/EXE_PLACEHOLDER.svg";
      icon.alt = "";
      icon.draggable = false;
      name.append(preview, icon, document.createElement("span"));
      name.lastElementChild.textContent = entry.label;

      link.append(
        name,
        cell("app-list__description app-list__meta", entry.description),
        cell("app-list__meta gtc-date-cell", entry.year),
        cell("app-list__meta gtc-created-cell", "GALANACCI")
      );
      rows.appendChild(link);
    }
    list.appendChild(rows);
  }
}
