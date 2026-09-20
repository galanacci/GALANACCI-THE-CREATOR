(() => {
  "use strict";

  const MOBILE_QUERY = window.matchMedia("(max-width: 760px)");
  const MIN_WIDTH = 280;
  const MIN_HEIGHT = 240;
  const EDGE_GAP = 8;

  const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

  function viewportSize() {
    const vv = window.visualViewport;

    return {
      width: Math.max(
        1,
        vv?.width || window.innerWidth || document.documentElement.clientWidth
      ),
      height: Math.max(
        1,
        vv?.height || window.innerHeight || document.documentElement.clientHeight
      ),
    };
  }

  function isMobile() {
    return MOBILE_QUERY.matches;
  }

  function setWindowToCurrentRect(win) {
    const rect = win.getBoundingClientRect();

    win.style.transform = "none";
    win.style.left = `${Math.round(rect.left)}px`;
    win.style.top = `${Math.round(rect.top)}px`;
    win.style.right = "auto";
    win.style.bottom = "auto";
    win.style.width = `${Math.round(rect.width)}px`;
    win.style.height = `${Math.round(rect.height)}px`;

    return rect;
  }

  function keepInsideViewport(win) {
    if (!isMobile() || win.hidden) return;

    const viewport = viewportSize();
    const rect = win.getBoundingClientRect();

    const maxWidth = Math.max(
      MIN_WIDTH,
      viewport.width - EDGE_GAP * 2
    );

    const maxHeight = Math.max(
      MIN_HEIGHT,
      viewport.height - EDGE_GAP * 2
    );

    const width = clamp(rect.width, MIN_WIDTH, maxWidth);
    const height = clamp(rect.height, MIN_HEIGHT, maxHeight);

    let left = rect.left;
    let top = rect.top;

    left = clamp(
      left,
      EDGE_GAP,
      Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP)
    );

    top = clamp(
      top,
      EDGE_GAP,
      Math.max(EDGE_GAP, viewport.height - height - EDGE_GAP)
    );

    win.style.transform = "none";
    win.style.left = `${Math.round(left)}px`;
    win.style.top = `${Math.round(top)}px`;
    win.style.right = "auto";
    win.style.bottom = "auto";
    win.style.width = `${Math.round(width)}px`;
    win.style.height = `${Math.round(height)}px`;
  }

  function addResizeHandle(win) {
    let handle = win.querySelector(
      ":scope > .gtc-mobile-resize-handle"
    );

    if (handle) return handle;

    handle = document.createElement("div");
    handle.className = "gtc-mobile-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.title = "Resize window";

    win.appendChild(handle);

    return handle;
  }

  function bindFolderWindow(win) {
    if (win.dataset.gtcMobileControlsV65 === "1") return;

    win.dataset.gtcMobileControlsV65 = "1";

    const chrome = win.querySelector(".folder-window__chrome");
    const resizeHandle = addResizeHandle(win);

    if (!chrome) return;

    let dragState = null;
    let resizeState = null;

    chrome.addEventListener("pointerdown", (event) => {
      if (!isMobile()) return;

      if (
        event.target.closest(
          ".folder-window__close, button, a, input, select, textarea"
        )
      ) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();

      const rect = setWindowToCurrentRect(win);

      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

      chrome.setPointerCapture?.(event.pointerId);
      win.classList.add("gtc-mobile-window-is-dragging");
    });

    chrome.addEventListener("pointermove", (event) => {
      if (
        !dragState ||
        event.pointerId !== dragState.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const viewport = viewportSize();

      const nextLeft = clamp(
        dragState.left + event.clientX - dragState.startX,
        EDGE_GAP,
        Math.max(
          EDGE_GAP,
          viewport.width - dragState.width - EDGE_GAP
        )
      );

      const nextTop = clamp(
        dragState.top + event.clientY - dragState.startY,
        EDGE_GAP,
        Math.max(
          EDGE_GAP,
          viewport.height - dragState.height - EDGE_GAP
        )
      );

      win.style.left = `${Math.round(nextLeft)}px`;
      win.style.top = `${Math.round(nextTop)}px`;
    });

    const endDrag = (event) => {
      if (
        !dragState ||
        event.pointerId !== dragState.pointerId
      ) {
        return;
      }

      chrome.releasePointerCapture?.(event.pointerId);
      dragState = null;
      win.classList.remove("gtc-mobile-window-is-dragging");
      keepInsideViewport(win);
    };

    chrome.addEventListener("pointerup", endDrag);
    chrome.addEventListener("pointercancel", endDrag);

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (!isMobile()) return;

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = setWindowToCurrentRect(win);

      resizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

      resizeHandle.setPointerCapture?.(event.pointerId);
      win.classList.add("gtc-mobile-window-is-resizing");
    });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (
        !resizeState ||
        event.pointerId !== resizeState.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const viewport = viewportSize();

      const maxWidth = Math.max(
        MIN_WIDTH,
        viewport.width - resizeState.left - EDGE_GAP
      );

      const maxHeight = Math.max(
        MIN_HEIGHT,
        viewport.height - resizeState.top - EDGE_GAP
      );

      const nextWidth = clamp(
        resizeState.width + event.clientX - resizeState.startX,
        MIN_WIDTH,
        maxWidth
      );

      const nextHeight = clamp(
        resizeState.height + event.clientY - resizeState.startY,
        MIN_HEIGHT,
        maxHeight
      );

      win.style.width = `${Math.round(nextWidth)}px`;
      win.style.height = `${Math.round(nextHeight)}px`;
    });

    const endResize = (event) => {
      if (
        !resizeState ||
        event.pointerId !== resizeState.pointerId
      ) {
        return;
      }

      resizeHandle.releasePointerCapture?.(event.pointerId);
      resizeState = null;
      win.classList.remove("gtc-mobile-window-is-resizing");
      keepInsideViewport(win);
    };

    resizeHandle.addEventListener("pointerup", endResize);
    resizeHandle.addEventListener("pointercancel", endResize);
  }

  function bindAll() {
    document
      .querySelectorAll(".folder-window")
      .forEach(bindFolderWindow);
  }

  function repairVisibleWindows() {
    if (!isMobile()) return;

    document
      .querySelectorAll(".folder-window")
      .forEach((win) => {
        if (!win.hidden && win.getAttribute("aria-hidden") !== "true") {
          keepInsideViewport(win);
        }
      });
  }

  function boot() {
    bindAll();
    repairVisibleWindows();

    // Folder windows are already present in the current desktop,
    // but this observer also covers any future dynamically-added window.
    const observer = new MutationObserver((mutations) => {
      let needsBind = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length) {
          needsBind = true;
          break;
        }
      }

      if (needsBind) {
        bindAll();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", repairVisibleWindows);
    window.visualViewport?.addEventListener(
      "resize",
      repairVisibleWindows
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {
      once: true,
    });
  } else {
    boot();
  }
})();
