(() => {
  "use strict";

  const MOBILE = window.matchMedia(
    "(hover: none), (pointer: coarse), (max-width: 760px)"
  );

  const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

  function viewport() {
    const visual = window.visualViewport;

    return {
      width:
        visual?.width ||
        window.innerWidth ||
        document.documentElement.clientWidth,
      height:
        visual?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight
    };
  }

  function bindWindow(folderWindow) {
    if (
      !folderWindow ||
      folderWindow.dataset.gtcLegacyMobileV66 === "1"
    ) {
      return;
    }

    folderWindow.dataset.gtcLegacyMobileV66 = "1";

    const chrome =
      folderWindow.querySelector(".folder-window__chrome");

    const resizeHandles = [
      ...folderWindow.querySelectorAll("[data-resize]")
    ];

    let resizing = null;

    function moveResize(event) {
      if (!resizing || !MOBILE.matches) return;

      const { direction, start, rect } = resizing;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      const view = viewport();

      const minWidth = Math.min(
        300,
        Math.max(240, view.width - 16)
      );

      const minHeight = Math.min(
        220,
        Math.max(200, view.height - 16)
      );

      let left = rect.left;
      let top = rect.top;
      let width = rect.width;
      let height = rect.height;

      if (direction.includes("e")) {
        width = clamp(
          rect.width + dx,
          minWidth,
          Math.max(minWidth, view.width - left)
        );
      }

      if (direction.includes("s")) {
        height = clamp(
          rect.height + dy,
          minHeight,
          Math.max(minHeight, view.height - top)
        );
      }

      if (direction.includes("w")) {
        left = clamp(
          rect.left + dx,
          0,
          rect.right - minWidth
        );
        width = rect.right - left;
      }

      if (direction.includes("n")) {
        top = clamp(
          rect.top + dy,
          0,
          rect.bottom - minHeight
        );
        height = rect.bottom - top;
      }

      folderWindow.style.transform = "none";
      folderWindow.style.left = `${left}px`;
      folderWindow.style.top = `${top}px`;
      folderWindow.style.right = "auto";
      folderWindow.style.bottom = "auto";
      folderWindow.style.width = `${width}px`;
      folderWindow.style.height = `${height}px`;
    }

    function finishResize() {
      resizing = null;
    }

    resizeHandles.forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (!MOBILE.matches) return;

        if (
          event.button !== undefined &&
          event.button !== 0
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const rect =
          folderWindow.getBoundingClientRect();

        resizing = {
          direction: handle.dataset.resize || "",
          start: {
            x: event.clientX,
            y: event.clientY
          },
          rect
        };

        handle.setPointerCapture?.(event.pointerId);
      });
    });

    window.addEventListener(
      "pointermove",
      moveResize,
      { passive: false }
    );

    window.addEventListener(
      "pointerup",
      finishResize
    );

    window.addEventListener(
      "pointercancel",
      finishResize
    );

    chrome?.addEventListener("pointerdown", (event) => {
      if (!MOBILE.matches) return;

      if (
        event.button !== undefined &&
        event.button !== 0
      ) {
        return;
      }

      if (event.target.closest("button")) {
        return;
      }

      event.preventDefault();

      const rect =
        folderWindow.getBoundingClientRect();

      const start = {
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top
      };

      const move = (moveEvent) => {
        const view = viewport();

        const maxLeft = Math.max(
          0,
          view.width - folderWindow.offsetWidth
        );

        const maxTop = Math.max(
          0,
          view.height - folderWindow.offsetHeight
        );

        folderWindow.style.transform = "none";
        folderWindow.style.left =
          `${clamp(
            start.left +
            moveEvent.clientX -
            start.x,
            0,
            maxLeft
          )}px`;

        folderWindow.style.top =
          `${clamp(
            start.top +
            moveEvent.clientY -
            start.y,
            0,
            maxTop
          )}px`;

        folderWindow.style.right = "auto";
        folderWindow.style.bottom = "auto";
      };

      const stop = () => {
        window.removeEventListener(
          "pointermove",
          move
        );

        window.removeEventListener(
          "pointerup",
          stop
        );

        window.removeEventListener(
          "pointercancel",
          stop
        );
      };

      window.addEventListener(
        "pointermove",
        move,
        { passive: false }
      );

      window.addEventListener(
        "pointerup",
        stop,
        { once: true }
      );

      window.addEventListener(
        "pointercancel",
        stop,
        { once: true }
      );
    });
  }

  function bindAll() {
    document
      .querySelectorAll(".folder-window")
      .forEach(bindWindow);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bindAll,
      { once: true }
    );
  } else {
    bindAll();
  }
})();
