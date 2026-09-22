(() => {
  "use strict";

  const poster = document.querySelector("[data-desktop-poster]");
  if (!poster) return;

  const posterKey = "gtc:desktop-poster-position";

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getBounds = () => {
    const rect = poster.getBoundingClientRect();

    return {
      maxX: Math.max(0, window.innerWidth - rect.width),
      maxY: Math.max(0, window.innerHeight - rect.height)
    };
  };

  const readPosterPosition = () => {
    try {
      const raw = sessionStorage.getItem(posterKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (
        typeof parsed?.x === "number" &&
        typeof parsed?.y === "number"
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

  const renderPoster = (position) => {
    const { maxX, maxY } = getBounds();

    const next = {
      x: clamp(position.x, 0, maxX),
      y: clamp(position.y, 0, maxY)
    };

    poster._posterPosition = next;
    poster.style.transform =
      `translate3d(${next.x}px, ${next.y}px, 0) rotate(-1.2deg)`;
  };

  const defaultPosition = () => ({
    x: Math.round(window.innerWidth * .07),
    y: Math.round(window.innerHeight * .15)
  });

  requestAnimationFrame(() => {
    renderPoster(readPosterPosition() || defaultPosition());
  });

  let posterDrag = null;

  poster.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    poster.classList.add("is-dragging");

    posterDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: poster._posterPosition || readPosterPosition() || defaultPosition()
    };

    poster.setPointerCapture?.(event.pointerId);
  });

  poster.addEventListener("pointermove", (event) => {
    if (!posterDrag || posterDrag.pointerId !== event.pointerId) return;

    event.preventDefault();

    renderPoster({
      x: posterDrag.origin.x + event.clientX - posterDrag.startX,
      y: posterDrag.origin.y + event.clientY - posterDrag.startY
    });
  });

  const finishPosterDrag = (event) => {
    if (!posterDrag || posterDrag.pointerId !== event.pointerId) return;

    poster.releasePointerCapture?.(event.pointerId);
    poster.classList.remove("is-dragging");

    writePosterPosition(poster._posterPosition || defaultPosition());
    posterDrag = null;
  };

  poster.addEventListener("pointerup", finishPosterDrag);
  poster.addEventListener("pointercancel", finishPosterDrag);

  window.addEventListener("resize", () => {
    renderPoster(poster._posterPosition || readPosterPosition() || defaultPosition());
    writePosterPosition(poster._posterPosition || defaultPosition());
  });
})();