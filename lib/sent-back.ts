// A person sent the ticket back since this stage last ended well: what comes now is only that
// change (pipeline.ts). Apart, with no imports, for the web to read it too.
type RunLike = { stage: string; status: string; cause?: string | null }
export function sentBackSince(state: { history?: RunLike[] }, stage: string): boolean {
  const runs = state.history ?? []
  const last = runs.findLastIndex(r => r.stage === stage && r.status === "ready")
  return last >= 0 && runs.slice(last + 1).some(r => !!r.cause?.startsWith("Sent back"))
}
