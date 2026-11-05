import { expect, test } from "bun:test"
import { bunStep } from "../lib/setup"

test("asks for a newer Bun below 1.4.4, where spawning processes leaked memory", () => {
  expect(bunStep("1.2.15")).toEqual({ id: "bun", state: "outdated", detail: "1.2.15" })
  expect(bunStep("1.4.3").state).toBe("outdated")
  expect(bunStep("1.4.4").state).toBe("done")
  expect(bunStep("1.10.0").state).toBe("done")
  expect(bunStep("2.0.0").state).toBe("done")
})
