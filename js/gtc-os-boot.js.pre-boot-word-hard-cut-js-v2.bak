(() => {
  "use strict";

  const boot = document.getElementById("gtc-os-boot");
  const BOOT_DURATION_MS = 3700;

  function enteredFromPog() {
    try {
      return (
        new URLSearchParams(window.location.search).get("entry") === "pog"
      );
    } catch {
      return false;
    }
  }

  function cleanPogEntryUrl() {
    try {
      const url = new URL(window.location.href);

      if (url.searchParams.get("entry") !== "pog") return;

      url.searchParams.delete("entry");

      const cleanUrl =
        url.pathname +
        (url.searchParams.toString()
          ? `?${url.searchParams.toString()}`
          : "") +
        url.hash;

      window.history.replaceState(
        window.history.state,
        "",
        cleanUrl || "/"
      );
    } catch {}
  }

  function bypassBootForPogExit() {
    document.documentElement.classList.add("gtc-entry-from-pog");
    document.body.classList.remove("gtc-os-boot-active");

    boot?.remove();

    const notice = document.getElementById("portfolio-notice-layer");

    if (notice) {
      notice.hidden = true;
      notice.setAttribute("aria-hidden", "true");
    }

    cleanPogEntryUrl();
  }

  function completeNormalBoot() {
    if (!boot) return;

    document.body.classList.remove("gtc-os-boot-active");
    boot.remove();
  }

  if (enteredFromPog()) {
    bypassBootForPogExit();
    return;
  }

  window.setTimeout(completeNormalBoot, BOOT_DURATION_MS);
})();