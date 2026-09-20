(() => {
  "use strict";

  const boot = document.getElementById("gtc-os-boot");
  const BOOT_DURATION_MS = 3700;

  function completeBoot() {
    if (!boot) return;

    /* Hard cut. No fade / scaling transition. */
    document.body.classList.remove("gtc-os-boot-active");
    boot.remove();

    /*
      The existing "You are now using GALANACCI OS 26"
      notification is already initialised underneath and appears
      immediately after the boot screen is removed.
    */
  }

  window.setTimeout(completeBoot, BOOT_DURATION_MS);
})();