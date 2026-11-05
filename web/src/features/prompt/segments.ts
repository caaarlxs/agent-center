// Dictation in pieces (voice.ts): where to cut the microphone's sound so each
// piece is written while you go on speaking, and never in the middle of a
// word. The sound's level every 20 ms decides: a cut goes in the middle of a
// pause, once a piece is long enough; a piece that runs too long with no
// pause is cut at its quietest moment. Pure: tested on their own.

export const FRAME_MS = 20
export const CUT = {
  minFrames: 6000 / FRAME_MS, // 6 s: shorter pieces give Whisper too little to go on
  maxFrames: 24_000 / FRAME_MS, // 24 s: Whisper hears 30 s at a time
  pauseFrames: 300 / FRAME_MS, // a pause of 0.3 s: between sentences, not between words
  lastFrames: 2000 / FRAME_MS, // where to look for the quietest moment
}

// The level of a stretch of sound (its root mean square).
export function rmsOf(samples: Float32Array) {
  let sum = 0
  for (const s of samples) sum += s * s
  return samples.length ? Math.sqrt(sum / samples.length) : 0
}

// What counts as quiet: a little over the room's noise (its quietest fifth).
export function thresholdOf(levels: number[]) {
  const sorted = [...levels].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0
  return Math.max(floor * 2.5, 0.004)
}

// Where to cut this piece (a frame's index), or null to wait: the middle of
// the first pause long enough, once the piece is long enough, the pause over
// (speech after it); with no pause by the longest a piece may be, its
// quietest moment of the last seconds.
export function cutAt(levels: number[], threshold: number): number | null {
  let start = -1
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]! < threshold) {
      if (start < 0) start = i
      continue
    }
    if (start >= 0 && i - start >= CUT.pauseFrames) {
      const middle = start + Math.floor((i - start) / 2)
      if (middle >= CUT.minFrames) return middle
    }
    start = -1
  }
  if (levels.length < CUT.maxFrames) return null
  let quietest = levels.length - CUT.lastFrames
  for (let i = quietest; i < levels.length; i++) if (levels[i]! < levels[quietest]!) quietest = i
  return quietest
}

// A piece with almost nothing over the threshold: not sent (Whisper invents
// words on silence).
export const isSilent = (levels: number[], threshold: number) => levels.filter(l => l >= threshold).length < levels.length * 0.05

// The sound as a WAV file: 16-bit mono PCM, as Whisper reads it.
export function wavOf(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => {
    const v = Math.max(-1, Math.min(1, s))
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true)
  })
  return out
}
