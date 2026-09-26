(() => {
  "use strict";

  const experience =
    document.querySelector(
      ".experience"
    );

  const trigger =
    document.querySelector(
      "#social-archive-trigger"
    );

  const dialog =
    document.querySelector(
      "#social-archive-dialog"
    );

  if (
    !experience ||
    !trigger ||
    !dialog
  ) {
    return;
  }

  const closeButtons = [
    ...dialog.querySelectorAll(
      "[data-social-archive-close]"
    )
  ];

  let lastFocused = null;

  function getFocusable() {
    return [
      ...dialog.querySelectorAll(
        "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    ];
  }

  function openArchive() {
    lastFocused =
      document.activeElement;

    dialog.hidden = false;

    experience.classList.add(
      "social-archive-open"
    );

    trigger.setAttribute(
      "aria-expanded",
      "true"
    );

    requestAnimationFrame(
      () => {
        const closeButton =
          dialog.querySelector(
            ".social-archive__close"
          );

        if (closeButton) {
          closeButton.focus();
        }
      }
    );
  }

  function closeArchive() {
    dialog.hidden = true;

    experience.classList.remove(
      "social-archive-open"
    );

    trigger.setAttribute(
      "aria-expanded",
      "false"
    );

    if (
      lastFocused &&
      typeof lastFocused.focus ===
        "function"
    ) {
      lastFocused.focus();
    } else {
      trigger.focus();
    }
  }

  trigger.addEventListener(
    "click",
    openArchive
  );

  closeButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        closeArchive
      );
    }
  );

  dialog.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        event.preventDefault();
        closeArchive();
        return;
      }

      if (
        event.key !== "Tab"
      ) {
        return;
      }

      const items =
        getFocusable();

      if (!items.length) {
        return;
      }

      const first =
        items[0];

      const last =
        items[
          items.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement ===
          first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement ===
          last
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  );
})();