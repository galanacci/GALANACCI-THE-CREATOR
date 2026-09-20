(() => {
  "use strict";

  const BOOT_MS = 2850;
  const TASKBAR_Z = 95000;

  const boot = document.getElementById("gtc-test-boot");
  const body = document.body;

  function finishBoot() {
    if (!body.classList.contains("gtc-test-booting")) return;

    body.classList.remove("gtc-test-booting");
    boot?.classList.add("is-leaving");

    // Current GALANACCI notice has already initialized underneath the boot.
    // Removing gtc-test-booting reveals it immediately after startup.
    setTimeout(() => boot?.remove(), 20);
  }

  window.setTimeout(finishBoot, BOOT_MS);

  // Enter / click can skip after the first visual beat.
  let canSkip = false;
  setTimeout(() => { canSkip = true; }, 650);

  boot?.addEventListener("pointerdown", () => {
    if (canSkip) finishBoot();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && canSkip && body.classList.contains("gtc-test-booting")) {
      finishBoot();
    }
  });

  /* ------------------------- shell markup ------------------------- */

  const taskbar = document.createElement("footer");
  taskbar.className = "gtc-shell-taskbar";
  taskbar.setAttribute("aria-label", "GALANACCI OS taskbar");
  taskbar.innerHTML = `
    <button
      type="button"
      id="gtc-shell-start"
      class="gtc-shell-start"
      aria-label="Open GALANACCI Start menu"
      aria-expanded="false"
    >
      <img src="assets/favicon.svg" alt="">
    </button>

    <div class="gtc-shell-divider" aria-hidden="true"></div>

    <div
      id="gtc-shell-tasks"
      class="gtc-shell-tasks"
      aria-label="Open GALANACCI windows"
    ></div>

    <div class="gtc-shell-tray">
      <span class="gtc-shell-tray__os">OS 26</span>
      <time id="gtc-shell-clock">--:--</time>
    </div>
  `;

  const menu = document.createElement("nav");
  menu.id = "gtc-shell-start-menu";
  menu.className = "gtc-shell-start-menu";
  menu.hidden = true;
  menu.setAttribute("aria-hidden", "true");
  menu.setAttribute("aria-label", "GALANACCI Start menu");
  menu.innerHTML = `
    <div class="gtc-shell-start-menu__rail">
      <span>GALANACCI OS 26</span>
    </div>
    <div id="gtc-shell-start-entries" class="gtc-shell-start-menu__entries"></div>
  `;

  document.body.append(menu, taskbar);

  const startButton = document.getElementById("gtc-shell-start");
  const entriesHost = document.getElementById("gtc-shell-start-entries");
  const tasksHost = document.getElementById("gtc-shell-tasks");
  const clock = document.getElementById("gtc-shell-clock");

  function updateClock() {
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  updateClock();
  setInterval(updateClock, 1000);

  function toggleMenu(force) {
    const shouldOpen =
      typeof force === "boolean"
        ? force
        : menu.hidden;

    menu.hidden = !shouldOpen;
    menu.setAttribute("aria-hidden", String(!shouldOpen));
    startButton.classList.toggle("is-open", shouldOpen);
    startButton.setAttribute("aria-expanded", String(shouldOpen));
  }

  startButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  menu.addEventListener("pointerdown", (event) => event.stopPropagation());

  document.addEventListener("pointerdown", (event) => {
    if (
      !menu.hidden &&
      !menu.contains(event.target) &&
      !startButton.contains(event.target)
    ) {
      toggleMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleMenu(false);
  });

  /* ---------------------- start menu entries ---------------------- */

  function shortcutLabel(shortcut) {
    return (
      shortcut.dataset.label ||
      shortcut.getAttribute("aria-label") ||
      shortcut.textContent ||
      "APP"
    ).trim();
  }

  function shortcutIcon(shortcut) {
    return shortcut.querySelector("img")?.getAttribute("src") || "";
  }

  function launchShortcut(shortcut) {
    toggleMenu(false);

    // Existing desktop.js remains authoritative.
    // Desktop uses double-click on pointer devices; touch paths can use click.
    shortcut.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    // Fallback for shortcuts whose current implementation is click-driven.
    setTimeout(() => {
      if (shortcut.isConnected) {
        shortcut.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
          })
        );
      }
    }, 30);
  }

  function buildStartMenu() {
    const shortcuts = [
      ...document.querySelectorAll(".desktop-shortcut")
    ].filter((shortcut) => shortcut.getAttribute("aria-disabled") !== "true");

    entriesHost.innerHTML = "";

    if (!shortcuts.length) {
      const empty = document.createElement("div");
      empty.className = "gtc-shell-start-menu__empty";
      empty.textContent = "NO APPLICATIONS AVAILABLE";
      entriesHost.appendChild(empty);
      return;
    }

    for (const shortcut of shortcuts) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gtc-shell-entry";

      const iconSrc = shortcutIcon(shortcut);
      const icon = iconSrc
        ? `<img src="${iconSrc}" alt="">`
        : `<span class="gtc-shell-entry__fallback" aria-hidden="true"></span>`;

      button.innerHTML = `
        ${icon}
        <span class="gtc-shell-entry__label"></span>
      `;

      button.querySelector(".gtc-shell-entry__label").textContent =
        shortcutLabel(shortcut);

      button.addEventListener("click", () => launchShortcut(shortcut));
      entriesHost.appendChild(button);
    }
  }

  // desktop.js creates shortcuts after module evaluation.
  const desktopApps = document.getElementById("desktop-apps");

  if (desktopApps) {
    const shortcutObserver = new MutationObserver(() => buildStartMenu());
    shortcutObserver.observe(desktopApps, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildStartMenu, { once: true });
  } else {
    buildStartMenu();
  }

  setTimeout(buildStartMenu, 250);

  /* ----------------------- taskbar window list -------------------- */

  const trackedWindows = () => [
    ...document.querySelectorAll(".folder-window, #experiment-window")
  ].filter(Boolean);

  function windowTitle(win) {
    const titleId = win.getAttribute("aria-labelledby");
    if (titleId) {
      const node = document.getElementById(titleId);
      if (node?.textContent?.trim()) return node.textContent.trim();
    }

    return (
      win.querySelector(
        ".folder-window__chrome > span, .experiment-window__chrome > span"
      )?.textContent?.trim() ||
      win.id ||
      "APP"
    );
  }

  function focusTrackedWindow(win) {
    if (win.hidden) return;

    // Visual focus only. We do not alter the existing close/open logic.
    for (const other of trackedWindows()) {
      if (other !== win) {
        const current = Number(other.style.zIndex || 0);
        if (current >= TASKBAR_Z - 100) other.style.zIndex = "";
      }
    }

    win.style.zIndex = String(TASKBAR_Z - 10);
    renderTasks();
  }

  function renderTasks() {
    const visible = trackedWindows().filter((win) => !win.hidden);

    tasksHost.innerHTML = "";

    for (const win of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gtc-shell-task";
      button.textContent = windowTitle(win);

      if (Number(win.style.zIndex || 0) === TASKBAR_Z - 10) {
        button.classList.add("is-active");
      }

      button.addEventListener("click", () => focusTrackedWindow(win));
      tasksHost.appendChild(button);
    }
  }

  for (const win of trackedWindows()) {
    new MutationObserver(renderTasks).observe(win, {
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden"]
    });

    win.addEventListener("pointerdown", () => focusTrackedWindow(win), {
      passive: true
    });
  }

  renderTasks();
})();