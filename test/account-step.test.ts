import { describe, expect, it } from "bun:test"
import { accountStep } from "../lib/setup"

describe("accountStep", () => {
  it("has no step while both use the same account, or one is not known", () => {
    expect(accountStep("a", "a")).toBeNull()
    expect(accountStep(null, "a")).toBeNull()
    expect(accountStep("a", null)).toBeNull()
  })
  it("warns when the terminal and Claude desktop use different accounts", () => {
    expect(accountStep("a", "b")).toEqual({ id: "account", state: "missing" })
  })
})
