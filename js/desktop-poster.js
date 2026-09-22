(() => {
  "use strict";

  const poster = document.querySelector("[data-desktop-poster]");
  if (!poster) return;

  const posterKey = "gtc:desktop-poster-position";
  const GRID = 16;
  const EDGE = 12;
  const COLLISION_GAP = 10;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getBounds = () => ({
    maxX: Math.max(EDGE, window.innerWidth - poster.offsetWidth - EDGE),
    maxY: Math.max(
      EDGE,
      window.innerHeight - poster.offsetHeight - EDGE - 28
    )
  });

  const readPosterPosition = () => {
    try {
      const raw = sessionStorage.getItem(posterKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (
        Number.isFinite(parsed?.x) &&
        Number.isFinite(parsed?.y)
      ) {
        return parsed;
      }
    } catch {}

    return null;
  };

  const writePosterPosition = (position) => {
    try {
      sessionStorage.setItem(posterKey, JSON.stringify(position));
    } catch {}
  };

  const defaultPosition = () => ({
    x: Math.round(window.innerWidth * .70),
    y: Math.round(window.innerHeight * .10)
  });

  const clampPosition = (position) => {
    const { maxX, maxY } = getBounds();

    return {
      x: clamp(position.x, EDGE, maxX),
      y: clamp(position.y, EDGE, maxY)
    };
  };

  const shortcutRects = () =>
    [...document.querySelectorAll(".desktop-shortcut")]
      .filter(
        (shortcut) =>
          shortcut.offsetWidth > 0 &&
          shortcut.offsetHeight > 0
      )
      .map((shortcut) => shortcut.getBoundingClientRect());

  const overlapsShortcutRect = (position, rect) => {
    const width = poster.offsetWidth;
    const height = poster.offsetHeight;

    return (
      position.x < rect.right + COLLISION_GAP &&
      position.x + width + COLLISION_GAP > rect.left &&
      position.y < rect.bottom + COLLISION_GAP &&
      position.y + height + COLLISION_GAP > rect.top
    );
  };

  const isPositionFree = (position) =>
    shortcutRects().every(
      (rect) => !overlapsShortcutRect(position, rect)
    );

  const findAvailablePosition = (requested) => {
    const { maxX, maxY } = getBounds();
    const candidate = clampPosition(requested);

    if (isPositionFree(candidate)) return candidate;

    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    const firstX = Math.ceil(EDGE / GRID) * GRID;
    const firstY = Math.ceil(EDGE / GRID) * GRID;

    for (let y = firstY; y <= maxY; y += GRID) {
      for (let x = firstX; x <= maxX; x += GRID) {
        const next = { x, y };
        if (!isPositionFree(next)) continue;

        const distance =
          Math.abs(next.x - candidate.x) +
          Math.abs(next.y - candidate.y);

        if (distance < closestDistance) {
          closest = next;
          closestDistance = distance;
        }
      }
    }

    return closest || candidate;
  };

  const renderPoster = (position) => {
    const next = clampPosition(position);

    poster._posterPosition = next;
    poster.style.transform =
      `translate3d(${next.x}px, ${next.y}px, 0) rotate(-1.2deg)`;

    return next;
  };

  const repairPosterPosition = () => {
    const requested =
      poster._posterPosition ||
      readPosterPosition() ||
      defaultPosition();

    const repaired = findAvailablePosition(requested);

    renderPoster(repaired);
    writePosterPosition(repaired);
  };

  /*
    desktop.js creates and positions shortcuts dynamically.
    Two animation frames ensures their geometry exists before repair.
  */
  requestAnimationFrame(() => {
    requestAnimationFrame(repairPosterPosition);
  });

  let posterDrag = null;

  poster.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const origin =
      poster._posterPosition ||
      readPosterPosition() ||
      findAvailablePosition(defaultPosition());

    poster.classList.add("is-dragging");

    posterDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...origin },
      lastValid: { ...origin }
    };

    poster.setPointerCapture?.(event.pointerId);
  });

  poster.addEventListener("pointermove", (event) => {
    if (!posterDrag || posterDrag.pointerId !== event.pointerId) return;

    event.preventDefault();

    const requested = clampPosition({
      x: posterDrag.origin.x + event.clientX - posterDrag.startX,
      y: posterDrag.origin.y + event.clientY - posterDrag.startY
    });

    /*
      Never allow the poster to visually pass through a shortcut.
      It remains at its last valid location while the pointer is over
      reserved shortcut space.
    */
    if (isPositionFree(requested)) {
      posterDrag.lastValid = requested;
      renderPoster(requested);
    }
  });

  const finishPosterDrag = (event) => {
    if (!posterDrag || posterDrag.pointerId !== event.pointerId) return;

    poster.releasePointerCapture?.(event.pointerId);
    poster.classList.remove("is-dragging");

    const settled = findAvailablePosition(
      poster._posterPosition ||
      posterDrag.lastValid ||
      defaultPosition()
    );

    renderPoster(settled);
    writePosterPosition(settled);

    posterDrag = null;
  };

  poster.addEventListener("pointerup", finishPosterDrag);
  poster.addEventListener("pointercancel", finishPosterDrag);

  window.addEventListener("resize", () => {
    requestAnimationFrame(repairPosterPosition);
  });
})();