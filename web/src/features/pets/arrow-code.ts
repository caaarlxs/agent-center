// ↑ ↑ ↓ ↓ ← → ← →: the arrows of a famous old code. Pure: tested on its own.
export const ARROWS = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"]

/** How far into the code after this key (the full length: done). */
export function arrowStep(at: number, key: string): number {
  if (ARROWS[at] === key) return at + 1
  if (key !== ARROWS[0]) return 0
  return at === 2 && key === "ArrowUp" ? 2 : 1 // ↑↑↑ keeps two ups
}
