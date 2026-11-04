// Which process runs a session, from the bridge mod's heartbeat (v13: `proc`,
// a token each process draws when it starts, and `surfaces`, where it draws:
// "terminal" for the REPL). A session lives in one process at a time; a
// second one on the same transcript (the terminal still open while Claude
// desktop opens it too) does not see the first one's turns, and each writes
// the heartbeat in turn. One change of process is a restart (Sleep, Wake);
// a change back within WINDOW_MS is two processes at once.

export type Beat = { proc?: unknown; surfaces?: unknown }
export type Tracks = Map<string, { last: string; changes: number[] }>
export type ProcessState = { inTerminal: boolean; isDoubled: boolean }

const WINDOW_MS = 30_000

export function processOf(tracks: Tracks, sessionId: string, beat: Beat, now: number): ProcessState {
  const inTerminal = Array.isArray(beat.surfaces) && beat.surfaces.includes("terminal")
  if (typeof beat.proc !== "string") return { inTerminal, isDoubled: false }
  const track = tracks.get(sessionId) ?? { last: beat.proc, changes: [] }
  if (track.last !== beat.proc) track.changes.push(now)
  track.last = beat.proc
  track.changes = track.changes.filter(at => now - at < WINDOW_MS)
  tracks.set(sessionId, track)
  return { inTerminal, isDoubled: track.changes.length >= 2 }
}
