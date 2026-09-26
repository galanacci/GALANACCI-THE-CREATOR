export function getPerformanceTier() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "low";
  return matchMedia("(hover: none), (pointer: coarse)").matches ? "balanced" : "high";
}

document.documentElement.dataset.performanceTier = getPerformanceTier();
