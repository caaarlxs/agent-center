import { describe, expect, it } from "vitest"
import { resolveTheme } from "./theme"

describe("resolveTheme", () => {
  it("follows the system until you choose", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })

  it("keeps your choice whatever the system says", () => {
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("reads anything else as the system", () => {
    expect(resolveTheme("sepia" as never, true)).toBe("dark")
  })
})
