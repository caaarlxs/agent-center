import { describe, expect, it } from "bun:test"
import { runnerOf, testRunOf } from "../lib/tests"

describe("runnerOf", () => {
  it("finds the runner a command uses", () => {
    expect(runnerOf("cd web && bun x vitest run 2>&1 | tail -5")).toBe("vitest")
    expect(runnerOf("bun test test/jira.test.ts")).toBe("bun test")
    expect(runnerOf("pnpm run test -- --watch=false")).toBe("pnpm test")
    expect(runnerOf("python -m pytest -q tests/")).toBe("pytest")
    expect(runnerOf("git status")).toBeNull()
  })
})

describe("testRunOf", () => {
  it("reads vitest", () => {
    const out = " FAIL  src/a.test.ts > geometry > snaps\n Test Files  1 failed | 40 passed (41)\n      Tests  1 failed | 23 passed | 2 skipped (26)\n"
    expect(testRunOf("bun x vitest run", out)).toEqual({ runner: "vitest", passed: 23, failed: 1, skipped: 2, failures: ["src/a.test.ts > geometry > snaps"] })
  })
  it("reads bun test", () => {
    const out = "(fail) jira > reads a row [0.21ms]\n\n 121 pass\n 1 fail\n 308 expect() calls\n"
    expect(testRunOf("bun test", out)).toEqual({ runner: "bun test", passed: 121, failed: 1, skipped: 0, failures: ["jira > reads a row"] })
  })
  it("reads jest", () => {
    const out = "  ● cart › adds an item\n\nTests:       2 failed, 1 skipped, 10 passed, 13 total\n"
    const run = testRunOf("npx jest", out)
    expect([run?.passed, run?.failed, run?.skipped, run?.failures]).toEqual([10, 2, 1, ["cart › adds an item"]])
  })
  it("reads pytest", () => {
    const out = "FAILED tests/test_api.py::test_login - assert 1 == 2\n========= 1 failed, 10 passed, 1 skipped in 3.21s =========\n"
    expect(testRunOf("pytest -q", out)).toEqual({ runner: "pytest", passed: 10, failed: 1, skipped: 1, failures: ["tests/test_api.py::test_login"] })
  })
  it("reads cargo and go", () => {
    expect(testRunOf("cargo test", "test a::b ... FAILED\ntest result: FAILED. 10 passed; 2 failed; 1 ignored\ntest result: ok. 3 passed; 0 failed; 0 ignored\n"))
      .toEqual({ runner: "cargo test", passed: 13, failed: 2, skipped: 1, failures: ["a::b"] })
    expect(testRunOf("go test ./...", "ok  \tgithub.com/x/a\t0.1s\n--- FAIL: TestB (0.00s)\nFAIL\tgithub.com/x/b\t0.2s\n"))
      .toEqual({ runner: "go test", passed: 1, failed: 1, skipped: 0, failures: ["TestB"] })
  })
  it("says nothing without a runner or a summary", () => {
    expect(testRunOf("ls", " 3 pass")).toBeNull()
    expect(testRunOf("bun test", "error: script not found")).toBeNull()
  })
})
