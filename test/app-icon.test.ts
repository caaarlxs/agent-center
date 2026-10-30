// When the board may put its icon on the app Chrome installed (lib/app-icon.ts).
import { describe, expect, it } from "bun:test"
import { isIcon, opensBoard, problemWith } from "../lib/app-icon"

const ORIGINS = new Set(["http://localhost:7777"])
const chrome = { CrAppModeShortcutURL: "http://localhost:7777/", CFBundleIconFile: "app.icns", CrAppModeIsAdhocSigned: true }

describe("opensBoard", () => {
  it("knows the installed app by the address it opens", () => {
    expect(opensBoard(chrome, ORIGINS)).toBe(true)
    expect(opensBoard({ ...chrome, CrAppModeShortcutURL: "http://localhost:7791/" }, ORIGINS)).toBe(false)
    expect(opensBoard({}, ORIGINS)).toBe(false)
  })
})

describe("problemWith", () => {
  it("lets an app kept and signed as Chrome does be changed", () => {
    expect(problemWith(chrome, true, true)).toBeNull()
  })
  it("leaves alone anything that does not match", () => {
    expect(problemWith({ ...chrome, CFBundleIconFile: "icon.icns" }, true, true)).toContain("does not know")
    expect(problemWith(chrome, false, true)).toContain("does not know")
    expect(problemWith({ ...chrome, CrAppModeIsAdhocSigned: false }, true, true)).toContain("signs it")
    expect(problemWith(chrome, true, false)).toContain("signature")
  })
})

it("takes only the icons it has", () => {
  expect(isIcon("orbit")).toBe(true)
  expect(isIcon("../x")).toBe(false)
})
