// Shared gesture/visual tuning, in device-independent pixels and milliseconds.
export const ISLAND_RELEASE_DISTANCE = 104;
export const ISLAND_FLIGHT_MS = 640;
export const ISLAND_RETURN_MS = 280;

export function inwardPull(edge: "left" | "right", startX: number, x: number) {
  return (x - startX) * (edge === "left" ? 1 : -1);
}

export function pullProgress(distance: number) {
  return Math.min(1, Math.max(0, distance / ISLAND_RELEASE_DISTANCE));
}

export function rubberOffset(progress: number) {
  // Increasing resistance: the pointer travels 104px while the body moves 58px.
  return 58 * (1 - Math.pow(1 - progress, 1.5));
}
