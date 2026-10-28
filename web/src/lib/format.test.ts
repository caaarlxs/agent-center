import { describe, expect, it } from "vitest"
import { memParts, memText } from "./format"

const MB = 1024 ** 2
const GB = 1024 ** 3

describe("memParts", () => {
  it("counts megabytes under a gigabyte, never below 1", () => {
    expect(memParts(340 * MB)).toEqual({ value: 340, unit: "MB", digits: 0 })
    expect(memParts(1000)).toEqual({ value: 1, unit: "MB", digits: 0 })
  })
  it("counts gigabytes with one decimal from a gigabyte", () => {
    expect(memParts(1.44 * GB)).toEqual({ value: 1.4, unit: "GB", digits: 1 })
    expect(memParts(2 * GB)).toEqual({ value: 2, unit: "GB", digits: 1 })
  })
  it("writes the same words as before", () => {
    expect(memText(340 * MB)).toBe("340 MB")
    expect(memText(1.44 * GB)).toBe("1.4 GB")
    expect(memText(2 * GB)).toBe("2 GB")
  })
})
