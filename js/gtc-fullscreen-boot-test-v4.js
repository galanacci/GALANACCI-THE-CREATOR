(() => {
  "use strict";

  const boot = document.getElementById("gtc-boot-v4");
  const BOOT_DURATION = 3700;

  function finishBoot() {
    if (!boot) return;

    document.body.classList.remove("gtc-boot-active");

    boot.remove();

    /*
      The current GALANACCI notification already initializes underneath.
      Removing the boot-active class reveals:
      "You are now using GALANACCI OS 26"
      immediately after the startup hard-cut.
    */
  }

  window.setTimeout(finishBoot, BOOT_DURATION);
})();