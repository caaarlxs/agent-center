import { describe, expect, it } from "vitest"
import { clampWidth, defaultWidth, panelWidth } from "./panel-width"

const base = { saved: null, isWide: false }

describe("panelWidth", () => {
  it("takes 42% of the window, between 420 and 760", () => {
    expect(defaultWidth(1440)).toBe(605)
    expect(defaultWidth(2400)).toBe(760)
    expect(panelWidth({ ...base, vw: 1200 })).toBe(504)
  })
  it("keeps your width, but leaves the board 300px", () => {
    expect(panelWidth({ ...base, vw: 1440, saved: 900 })).toBe(900)
    expect(panelWidth({ ...base, vw: 1440, saved: 1300 })).toBe(1140)
  })
  it("widens to 75% of the window", () => expect(panelWidth({ ...base, vw: 1600, isWide: true })).toBe(1200))
  it("keeps its width whatever tab shows: a workspace's side opens beside it (SideFlyout)", () =>
    expect(panelWidth({ ...base, vw: 1440 })).toBe(605))
  it("is a 640px sheet in a medium window", () => {
    expect(panelWidth({ ...base, vw: 1000 })).toBe(640)
    expect(panelWidth({ ...base, vw: 500 })).toBe(500)
  })
})

describe("clampWidth", () => {
  it("keeps between 380 and the window less 300", () => {
    expect(clampWidth(100, 1440)).toBe(380)
    expect(clampWidth(1400, 1440)).toBe(1140)
  })
})
