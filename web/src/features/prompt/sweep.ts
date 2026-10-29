// The voice glow while Whisper writes what you said: its lobes gather into
// one beam (in GATHER_MS) that sweeps the reply box from side to side, easing
// into each turn, as long as the transcription lasts.
import type { VoiceBeamMotion } from "voice-glow"

const GATHER_MS = 300
const LAP_MS = 1600 // one way across
const REACH = 0.8 // how far from the centre, in half-widths of the glow

export function sweepAt(ms: number): VoiceBeamMotion {
  const gather = Math.min(1, ms / GATHER_MS)
  const phase = (ms / LAP_MS) * Math.PI
  return { gather, offset: REACH * Math.sin(phase), stretch: 0.4 * Math.abs(Math.cos(phase)), heldLevel: 0.55 }
}
