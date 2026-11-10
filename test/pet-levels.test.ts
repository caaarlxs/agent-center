import { describe, expect, it } from "bun:test"
import { STAGES, XP, award, levelOf, packsBetween } from "../lib/pet-levels"

describe("levelOf", () => {
  it("starts at level 1, a baby", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 50, stage: "baby" })
  })
  it("needs a little more for each level", () => {
    expect(levelOf(50).level).toBe(2)
    expect(levelOf(124)).toMatchObject({ level: 2, into: 74, need: 75 })
    expect(levelOf(125).level).toBe(3)
  })
  it("grows a stage at 5, 10, 20 and 35", () => {
    const xpFor = (level: number) => { let xp = 0; while (levelOf(xp).level < level) xp += 5; return xp }
    expect(STAGES.map(s => levelOf(xpFor(s.from)).stage)).toEqual(["baby", "young", "grown", "elite", "legend"])
  })
  it("stops at the top level", () => {
    expect(levelOf(10_000_000)).toMatchObject({ level: 60, into: 0, need: 0 })
  })
})

describe("award", () => {
  it("gives each kind its XP, more to a pet well looked after, less to a hungry or tired one", () => {
    expect(award("turn", "ok")).toBe(XP.turn)
    expect(award("turn", "well")).toBe(Math.round(XP.turn * 1.5))
    expect(award("turn", "poorly")).toBe(Math.round(XP.turn * 0.5))
  })
})

describe("packsBetween", () => {
  it("gives a pack for every fifth level reached", () => {
    expect(packsBetween(3, 4)).toBe(0)
    expect(packsBetween(4, 5)).toBe(1)
    expect(packsBetween(4, 11)).toBe(2)
  })
})
