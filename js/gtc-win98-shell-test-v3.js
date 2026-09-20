(() => {
  "use strict";

  /* ==============================================================
     BOOT SEQUENCE
     Mirrors the reference WindowsStartupScreen behavior:
     fixed 5-second fake-load, stepped loading strip, hard cut to OS.
     ============================================================== */

  const startup = document.getElementById("gtc98-startup-screen");
  const STARTUP_MS = 3700;

  window.setTimeout(() => {
    if (!startup) return;
    startup.hidden = true;
    startup.setAttribute("aria-hidden", "true");
    startup.remove();
    // The existing GALANACCI OS 26 notice has initialized underneath.
    // Once the startup screen disappears, that existing notification is
    // the first desktop UI the user sees.
  }, STARTUP_MS);

  /* ==============================================================
     TASKBAR + START MENU
     ============================================================== */

  const taskbar = document.createElement("footer");
  taskbar.className = "gtc98-taskbar";
  taskbar.setAttribute("aria-label", "GALANACCI OS taskbar");

  taskbar.innerHTML = `
    <button
      type="button"
      id="gtc98-start-button"
      class="gtc98-start-button"
      aria-label="Open GALANACCI menu"
      aria-expanded="false"
    >
      <span>
        <img src="assets/favicon.svg" alt="">
        <span class="gtc98-start-button__text">GALANACCI</span>
      </span>
    </button>

    <div class="gtc98-taskbar-separator" aria-hidden="true"></div>

    <div
      id="gtc98-taskbar-tasks"
      class="gtc98-taskbar-tasks"
      aria-label="Open windows"
    ></div>

    <div class="gtc98-taskbar-separator gtc98-tray-separator" aria-hidden="true"></div>

    <div class="gtc98-notification-area">
      <span class="gtc98-speaker" aria-hidden="true"></span>
      <time id="gtc98-clock" class="gtc98-notification-time">--:--</time>
    </div>
  `;

  const menu = document.createElement("nav");
  menu.id = "gtc98-start-menu";
  menu.className = "gtc98-start-menu";
  menu.hidden = true;
  menu.setAttribute("aria-hidden", "true");
  menu.setAttribute("aria-label", "GALANACCI Start menu");

  menu.innerHTML = `
    <div class="gtc98-start-menu__rail">
      <span>GALANACCI OS 26</span>
    </div>

    <div class="gtc98-start-menu__entries">
      <button class="gtc98-start-entry is-disabled" type="button" disabled>
        <img src="assets/favicon.svg" alt="">
        <span>GALANACCI Update</span>
      </button>

      <div class="gtc98-start-menu__separator"></div>

      <button class="gtc98-start-entry" type="button" data-gtc98-open-app="experiments-folder">
        <span class="gtc98-start-entry__doc" aria-hidden="true"></span>
        <span>APPS</span>
      </button>

      <button class="gtc98-start-entry" type="button" data-gtc98-open-app="ss-folder">
        <span class="gtc98-start-entry__doc" aria-hidden="true"></span>
        <span>SS / Archive</span>
      </button>

      <button class="gtc98-start-entry" type="button" data-gtc98-open-app="pog-exe">
        <img src="assets/icons/PoG.EXE.svg" alt="">
        <span>PÂ°G.EXE</span>
      </button>

      <button class="gtc98-start-entry is-disabled" type="button" disabled>
        <span class="gtc98-start-entry__doc" aria-hidden="true"></span>
        <span>Run...</span>
      </button>

      <button class="gtc98-start-entry" type="button" id="gtc98-about">
        <img src="assets/favicon.svg" alt="">
        <span>About GALANACCI</span>
      </button>
    </div>
  `;

  document.body.append(menu, taskbar);

  const startButton = document.getElementById("gtc98-start-button");
  const tasksHost = document.getElementById("gtc98-taskbar-tasks");
  const clock = document.getElementById("gtc98-clock");

  function updateClock() {
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  updateClock();
  setInterval(updateClock, 1000);

  function toggleStartMenu(force) {
    const open =
      typeof force === "boolean"
        ? force
        : menu.hidden;

    menu.hidden = !open;
    menu.setAttribute("aria-hidden", String(!open));
    startButton.classList.toggle("is-open", open);
    startButton.setAttribute("aria-expanded", String(open));
  }

  startButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleStartMenu();
  });

  menu.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      !menu.hidden &&
      !menu.contains(event.target) &&
      !startButton.contains(event.target)
    ) {
      toggleStartMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleStartMenu(false);
  });

  /* ==============================================================
     START-MENU APP LAUNCHING
     Existing desktop.js stays authoritative.
     ============================================================== */

  function findDesktopShortcut(appId) {
    return document.querySelector(
      `.desktop-shortcut[data-app-id="${CSS.escape(appId)}"]`
    );
  }

  function openDesktopShortcut(appId) {
    const shortcut = findDesktopShortcut(appId);
    if (!shortcut) return;

    toggleStartMenu(false);

    const touch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    shortcut.dispatchEvent(
      new MouseEvent(touch ? "click" : "dblclick", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );
  }

  menu.querySelectorAll("[data-gtc98-open-app]").forEach((entry) => {
    entry.addEventListener("click", () => {
      openDesktopShortcut(entry.dataset.gtc98OpenApp);
    });
  });

  const aboutButton = document.getElementById("gtc98-about");

  aboutButton?.addEventListener("click", () => {
    toggleStartMenu(false);

    const noticeLayer = document.getElementById("portfolio-notice-layer");
    const notice = document.getElementById("portfolio-notice");

    if (noticeLayer) {
      noticeLayer.hidden = false;
      noticeLayer.setAttribute("aria-hidden", "false");
    }

    if (notice) {
      notice.hidden = false;
    }
  });

  /* ==============================================================
     TASK ENTRIES
     Only reflects current GALANACCI windows. No Win98 window system
     is imported.
     ============================================================== */

  const trackedWindows = [
    ...document.querySelectorAll(".folder-window, #experiment-window")
  ].filter(Boolean);

  const taskState = new Map();

  function titleForWindow(win) {
    const labelledBy = win.getAttribute("aria-labelledby");

    if (labelledBy) {
      const title = document.getElementById(labelledBy);
      if (title?.textContent?.trim()) return title.textContent.trim();
    }

    return (
      win.querySelector(
        ".folder-window__chrome > span, .experiment-window__chrome > span"
      )?.textContent?.trim() ||
      win.id ||
      "APP"
    );
  }

  function iconForWindow(win) {
    if (win.id === "apps-folder-window" || win.id === "ss-folder-window") {
      return "assets/icons/EXE_PLACEHOLDER.svg";
    }

    return "assets/icons/EXE_PLACEHOLDER.svg";
  }

  function markOpened(win) {
    if (!win.hidden) {
      taskState.set(win, {
        opened: true,
        minimized: false
      });
    }
  }

  function minimizeWindow(win) {
    const state = taskState.get(win) || { opened: true, minimized: false };
    state.opened = true;
    state.minimized = true;
    taskState.set(win, state);

    win.hidden = true;
    win.setAttribute("aria-hidden", "true");
    renderTaskEntries();
  }

  function restoreWindow(win) {
    const state = taskState.get(win) || { opened: true, minimized: false };
    state.opened = true;
    state.minimized = false;
    taskState.set(win, state);

    win.hidden = false;
    win.setAttribute("aria-hidden", "false");
    win.classList.add("is-open");
    renderTaskEntries();
  }

  function renderTaskEntries() {
    tasksHost.innerHTML = "";

    for (const win of trackedWindows) {
      const state = taskState.get(win);

      if (!state?.opened) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "gtc98-task-entry";

      if (!win.hidden && !state.minimized) {
        button.classList.add("is-focused");
      }

      button.innerHTML = `
        <img src="${iconForWindow(win)}" alt="">
        <span></span>
      `;

      button.querySelector("span").textContent = titleForWindow(win);

      button.addEventListener("click", () => {
        const current = taskState.get(win);

        if (!current) return;

        if (!win.hidden && !current.minimized) {
          minimizeWindow(win);
        } else {
          restoreWindow(win);
        }
      });

      tasksHost.appendChild(button);
    }
  }

  for (const win of trackedWindows) {
    if (!win.hidden) markOpened(win);

    const observer = new MutationObserver(() => {
      const state = taskState.get(win);

      if (!win.hidden) {
        taskState.set(win, {
          opened: true,
          minimized: false
        });
      } else if (state?.opened && !state.minimized) {
        // Hidden by the existing close button = genuinely closed.
        taskState.delete(win);
      }

      renderTaskEntries();
    });

    observer.observe(win, {
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden"]
    });
  }

  renderTaskEntries();
})();