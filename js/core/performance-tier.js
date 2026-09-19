let currentTier = "medium";

export function initPerformanceTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || cores <= 2 || memory <= 2) {
    currentTier = "low";
  } else if (cores >= 8 && memory >= 8) {
    currentTier = "high";
  } else {
    currentTier = "medium";
  }

  return currentTier;
}

export function getPerformanceTier() {
  return currentTier;
}
