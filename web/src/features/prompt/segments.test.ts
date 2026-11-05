import { describe, expect, it } from "vitest"
import { CUT, cutAt, isSilent, thresholdOf, wavOf } from "./segments"

const speech = (n: number) => Array(n).fill(0.1)
const quiet = (n: number) => Array(n).fill(0.001)

describe("cutAt", () => {
  const t = 0.01
  it("waits for the shortest piece before cutting", () => {
    expect(cutAt([...speech(100), ...quiet(30)], t)).toBeNull()
  })
  it("cuts in the middle of the first pause long enough once the piece is long enough", () => {
    const levels = [...speech(CUT.minFrames), ...quiet(20), ...speech(50)]
    expect(cutAt(levels, t)).toBe(CUT.minFrames + 10)
  })
  it("never cuts at a pause too short (between two words)", () => {
    expect(cutAt([...speech(CUT.minFrames), ...quiet(CUT.pauseFrames - 1), ...speech(50)], t)).toBeNull()
  })
  it("waits for the pause to end before cutting in its middle", () => {
    expect(cutAt([...speech(CUT.minFrames), ...quiet(CUT.pauseFrames)], t)).toBeNull()
  })
  it("with no pause at all, cuts at the quietest moment of the last seconds", () => {
    const levels = speech(CUT.maxFrames)
    levels[CUT.maxFrames - 40] = 0.02
    expect(cutAt(levels, t)).toBe(CUT.maxFrames - 40)
  })
})

describe("thresholdOf", () => {
  it("is a little over the room's noise, never below a floor", () => {
    expect(thresholdOf([...quiet(80), ...speech(20)])).toBeCloseTo(0.004)
    expect(thresholdOf([...Array(80).fill(0.01), ...speech(20)])).toBeCloseTo(0.025)
  })
})

describe("isSilent", () => {
  it("is a piece with almost nothing over the threshold (Whisper invents words on silence)", () => {
    expect(isSilent(quiet(300), 0.01)).toBe(true)
    expect(isSilent([...quiet(290), ...speech(10)], 0.01)).toBe(true)
    expect(isSilent([...quiet(250), ...speech(50)], 0.01)).toBe(false)
  })
})

describe("wavOf", () => {
  it("writes 16-bit mono PCM with its header", () => {
    const wav = wavOf(new Float32Array([0, 1, -1, 0.5]), 16000)
    const view = new DataView(wav.buffer)
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF")
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 16384])
  })
})
