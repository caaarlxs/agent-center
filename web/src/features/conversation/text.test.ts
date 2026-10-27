import { describe, expect, it } from "vitest"
import { dialogAnswer, endOf, familyOf, isTemplate, partsOf, pathInCode, pathInLink } from "./text"

describe("partsOf", () => {
  it("folds pasted blocks away from what was typed", () => {
    const { parts, isLong } = partsOf("look <pasted_content>a\nb</pasted_content> here")
    expect(parts).toEqual([{ typed: "look " }, { pasted: "a\nb" }, { typed: " here" }])
    expect(isLong).toBe(false)
  })
  it("counts only typed text as long", () => {
    expect(partsOf("x".repeat(701)).isLong).toBe(true)
    expect(partsOf(`hi <pasted-content>${"x".repeat(2000)}</pasted-content>`).isLong).toBe(false)
  })
})

describe("isTemplate", () => {
  it("is a reply that asks to be completed", () => {
    expect(isTemplate("The name is: ")).toBe(true)
    expect(isTemplate("Use this one…")).toBe(true)
    expect(isTemplate("Go on...")).toBe(true)
    expect(isTemplate("Yes, merge it")).toBe(false)
  })
})

describe("dialogAnswer", () => {
  it("says the app's answers in words", () => {
    expect(dialogAnswer("Create a new branch named fix/login.")).toBe("New branch: fix/login")
    expect(dialogAnswer("Stay on the current branch")).toBe("Stay on the current branch")
    expect(dialogAnswer("Approved")).toBe("Approved")
  })
})

describe("paths", () => {
  it("finds a file in inline code", () => {
    expect(pathInCode("/Users/me/report.md")).toBe("/Users/me/report.md")
    expect(pathInCode("~/x.py")).toBe("~/x.py")
    expect(pathInCode("npm run build")).toBeNull()
  })
  it("finds a file in a relative link, without the line number", () => {
    expect(pathInLink("src/app%20one.ts:12:3")).toBe("src/app one.ts")
    expect(pathInLink("https://example.com")).toBeNull()
    expect(pathInLink("#top")).toBeNull()
  })
})

describe("familyOf", () => {
  it("groups types by colour", () => {
    expect(familyOf("xlsx")).toBe("sheet")
    expect(familyOf("md")).toBe("doc")
    expect(familyOf("pdf")).toBe("pdf")
    expect(familyOf("ts")).toBe("code")
  })
})

describe("endOf", () => {
  const base = { isRunning: false, startedAt: 0, endedAt: 3200, exitCode: 0, wasStopped: false }
  it("says how a command ended", () => {
    expect(endOf({ ...base, isRunning: true })).toBeNull()
    expect(endOf(base)).toEqual({ isOk: true, text: "Done in 3 s" })
    expect(endOf({ ...base, exitCode: 2 })).toEqual({ isOk: false, text: "Ended with code 2 in 3 s" })
    expect(endOf({ ...base, wasStopped: true })).toEqual({ isOk: false, text: "Stopped after 3 s" })
  })
})
