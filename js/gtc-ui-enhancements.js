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

  const DESCRIPTIONS = Object.freeze({
    "PUGILIST": "Cubist inspired boxing illustrations.",
    "PUGILIST.EXE": "Cubist inspired boxing illustrations.",
    "FIBONACCI": "An audio visualiser inspired by Fibonacci.",
    "FIBONACCI.EXE": "An audio visualiser inspired by Fibonacci.",
    "GALANACCI": "My initial clothing brand.",
    "GALANACCI.EXE": "My initial clothing brand.",
    "GVERSE": "A multi-disciplinary design studio.",
    "GVERSE.EXE": "A multi-disciplinary design studio.",
    "ARCHITECTURE": "Architecture portfolio.",
    "ARCHITECTURE.EXE": "Architecture portfolio.",
    "FIGHTPOSTERS": "Artworks of major boxing events in 2024",
    "FIGHTPOSTERS.EXE": "Artworks of major boxing events in 2024",
    "PUGILISM": "Artworks of boxing legends of different eras.",
    "PUGILISM.EXE": "Artworks of boxing legends of different eras.",
    "365LOOKS": "365 days, 365 looks. Daily fashion sketches.",
    "365LOOKS.EXE": "365 days, 365 looks. Daily fashion sketches.",
    "2(XY-T)": "An iteration of Bradley Tangonan's XY - T project.",
    "2(XY-T).EXE": "An iteration of Bradley Tangonan's XY - T project.",
    "2(XY+T)": "An iteration of Bradley Tangonan's XY - T project.",
    "2(XY+T).EXE": "An iteration of Bradley Tangonan's XY - T project.",
    "WARRIORSOFBOXING": "Ink drawings of boxing's hall of famers.",
    "WARRIORSOFBOXING.EXE": "Ink drawings of boxing's hall of famers.",
    "GTHEFIGHTER": "A digital art collection exploring boxing's greats.",
    "GTHEFIGHTER.EXE": "A digital art collection exploring boxing's greats.",
    "EVERYDAYS": "Mixed media digital art inspired by Beeple.",
    "EVERYDAYS.EXE": "Mixed media digital art inspired by Beeple.",
    "RENAISSANCE": "Digital paintings inspired by Caravaggio.",
    "RENAISSANCE.EXE": "Digital paintings inspired by Caravaggio.",
    "BLACKBOOK": "Old diary ink drawings.",
    "BLACKBOOK.EXE": "Old diary ink drawings."
  });

  function normalise(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function descriptionFor(value) {
    const label = normalise(value);

    const key = Object.keys(DESCRIPTIONS)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => label.includes(candidate));

    return key ? DESCRIPTIONS[key] : "";
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

      descriptionCell.textContent =
        descriptionFor(nameCell?.textContent || "");

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

  function enhanceFolders() {
    document
      .querySelectorAll(".app-list")
      .forEach(ensureDescriptionColumn);

    updateFolderTitles();
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
