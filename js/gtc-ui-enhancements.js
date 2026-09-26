(() => {
  "use strict";

  const OS_SESSION_KEY = "gtc:os-session-active";

  function hasActiveOsSession() {
    try {
      return sessionStorage.getItem(OS_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }

  function activateOsSession() {
    try {
      sessionStorage.setItem(OS_SESSION_KEY, "1");
    } catch {
      /* Session persistence is progressive enhancement only. */
    }
  }

  function normalise(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function parseCreatedDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return Number.NEGATIVE_INFINITY;

    let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }

    m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    m = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      return Date.UTC(Number(m[2]), Number(m[1]) - 1, 1);
    }

    m = raw.match(/^(\d{4})$/);
    if (m) {
      return Date.UTC(Number(m[1]), 0, 1);
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  function ensureDescriptionColumn(list) {
    const header =
      list.querySelector(":scope > .app-list__header") ||
      list.querySelector(".app-list__header");

    if (header) {
      let descriptionHeader =
        header.querySelector(".app-list__description-header");

      if (!descriptionHeader) {
        descriptionHeader = document.createElement("span");
        descriptionHeader.className = "app-list__description-header";
        descriptionHeader.textContent = "DESCRIPTION";
      }

      const cells = [...header.children];

      const nameCell =
        cells.find((cell) => normalise(cell.textContent) === "NAME") ||
        cells[0];

      const dateCell =
        cells.find((cell) => normalise(cell.textContent) === "DATE CREATED") ||
        cells[1];

      const createdCell =
        cells.find((cell) => normalise(cell.textContent) === "CREATED BY") ||
        cells[2];

      [
        nameCell,
        descriptionHeader,
        dateCell,
        createdCell
      ].forEach((cell) => {
        if (cell) header.appendChild(cell);
      });
    }

    const rows = [
      ...list.querySelectorAll(":scope > .app-list__row")
    ];

    rows.forEach((row) => {
      const nameCell =
        row.querySelector(".app-list__name") ||
        row.children[0];

      let descriptionCell =
        row.querySelector(".app-list__description");

      const nonNameCells =
        [...row.children].filter(
          (cell) =>
            cell !== nameCell &&
            cell !== descriptionCell
        );

      const dateCell =
        row.querySelector(".gtc-date-cell") ||
        nonNameCells[0];

      const createdCell =
        row.querySelector(".gtc-created-cell") ||
        nonNameCells[1];

      if (dateCell) {
        dateCell.classList.add("gtc-date-cell", "app-list__meta");
      }

      if (createdCell) {
        createdCell.classList.add("gtc-created-cell", "app-list__meta");
      }

      if (!descriptionCell) {
        descriptionCell = document.createElement("span");
      }

      descriptionCell.classList.add(
        "app-list__description",
        "app-list__meta"
      );

      [
        nameCell,
        descriptionCell,
        dateCell,
        createdCell
      ].forEach((cell) => {
        if (cell) row.appendChild(cell);
      });
    });

    rows
      .map((row, originalIndex) => ({
        row,
        originalIndex,
        timestamp: parseCreatedDate(
          row.querySelector(".gtc-date-cell")?.textContent || ""
        )
      }))
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return b.timestamp - a.timestamp;
        }
        return a.originalIndex - b.originalIndex;
      })
      .forEach(({ row }) => list.appendChild(row));
  }

  function updateFolderTitles() {
    document.querySelectorAll(".folder-window").forEach((win) => {
      const chrome = win.querySelector(".folder-window__chrome");
      if (!chrome) return;

      const title =
        chrome.querySelector(":scope > span") ||
        chrome.querySelector("[id$='-title'], .folder-window__title");

      if (!title) return;

      const current = normalise(title.textContent);
      const id = normalise(win.id);

      if (current === "APPS" || id.includes("APPS")) {
        title.textContent = "APPS - CODING EXPERIMENTS";
      } else if (current === "SS" || id.includes("SS-FOLDER")) {
        title.textContent = "SS - ARCHIVE WORKS";
      }
    });
  }

  function initFolderFilters(folder) {
    const controls = folder.querySelector("[data-folder-controls]");
    const list = folder.querySelector(".app-list");
    if (!controls || !list) return;

    const search = controls.querySelector("[data-folder-search]");
    const type = controls.querySelector("[data-folder-type]");
    const sort = controls.querySelector("[data-folder-sort]");
    const clear = controls.querySelector("[data-folder-clear]");
    const count = controls.querySelector("[data-folder-count]");
    const body = folder.querySelector(".app-folder-body");
    const rows = [...list.querySelectorAll(":scope > .app-list__row")];
    const originalOrder = new Map(rows.map((row, index) => [row, index]));
    const empty = document.createElement("div");
    empty.className = "app-list__empty";
    empty.textContent = "NO MATCHING FILES";
    empty.hidden = true;
    list.appendChild(empty);

    function applyFilters() {
      const query = search.value.trim().replace(/\s+/g, " ").toLowerCase();
      const category = type.value;
      const direction = sort.value === "oldest" ? 1 : -1;

      rows
        .slice()
        .sort((a, b) => {
          const aDate = parseCreatedDate(a.querySelector(".gtc-date-cell")?.textContent);
          const bDate = parseCreatedDate(b.querySelector(".gtc-date-cell")?.textContent);
          return direction * (aDate - bDate) || originalOrder.get(a) - originalOrder.get(b);
        })
        .forEach((row) => list.insertBefore(row, empty));

      let visible = 0;
      rows.forEach((row) => {
        const name = row.dataset.label || row.querySelector(".app-list__name")?.textContent || "";
        const description = row.querySelector(".app-list__description")?.textContent || "";
        const matchesText = `${name} ${description}`.toLowerCase().includes(query);
        const matchesType = category === "all" || row.dataset.appType === category;
        row.hidden = !(matchesText && matchesType);
        if (row.hidden) {
          row.classList.remove("is-selected");
          row.removeAttribute("aria-selected");
        } else {
          visible += 1;
        }
      });

      empty.hidden = visible !== 0;
      count.textContent = `${visible} / ${rows.length} FILES`;
      clear.disabled = !query && category === "all" && sort.value === "newest";
      if (body) {
        body.scrollTop = 0;
        body.scrollLeft = 0;
      }
    }

    function resetFilters() {
      search.value = "";
      type.value = "all";
      sort.value = "newest";
      applyFilters();
    }

    search.addEventListener("input", applyFilters);
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !search.value) return;
      event.preventDefault();
      event.stopPropagation();
      search.value = "";
      applyFilters();
    });
    type.addEventListener("change", applyFilters);
    sort.addEventListener("change", applyFilters);
    clear.addEventListener("click", resetFilters);
    folder.addEventListener("gtc:folder-open", resetFilters);
    applyFilters();
  }

  function enhanceFolders() {
    document
      .querySelectorAll(".app-list")
      .forEach(ensureDescriptionColumn);

    updateFolderTitles();
    document
      .querySelectorAll("[data-folder-window]")
      .forEach(initFolderFilters);
  }

  function initNotice() {
    const layer = document.getElementById("portfolio-notice-layer");
    if (!layer) return;

    if (hasActiveOsSession()) {
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
      return;
    }

    if (layer.dataset.gtcInitialised === "1") {
      layer.hidden = false;
      layer.setAttribute("aria-hidden", "false");
      return;
    }

    layer.dataset.gtcInitialised = "1";

    const closeNotice = () => {
      activateOsSession();
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
    };

    layer
      .querySelectorAll("[data-close-portfolio-notice]")
      .forEach((button) => {
        button.addEventListener("click", closeNotice);
      });

    layer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNotice();
      }
    });

    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      layer.querySelector(".portfolio-notice__ok")?.focus();
    });
  }

  function boot() {
    enhanceFolders();
    initNotice();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
