// The time left of a countdown after `elapsed` ms: it stands still while
// paused and never goes below zero.
export const leftAfter = (left: number, elapsed: number, isPaused: boolean) => (isPaused ? left : Math.max(0, left - elapsed))
