import { expect, test } from "bun:test"
import { simulatorStep } from "../lib/simulator"

const ready = { xcode: "ok", hasRuntime: true, hasAxe: true, job: null } as const

test("the simulator step: done when Xcode, an iOS runtime and AXe are all here", () => {
  expect(simulatorStep(ready)).toEqual({ id: "simulator", state: "done" })
})

test("what only the person can do comes first, said as it is", () => {
  expect(simulatorStep({ ...ready, xcode: "missing" })).toEqual({ id: "simulator", state: "unavailable", detail: "no-xcode" })
  expect(simulatorStep({ ...ready, xcode: "license" })).toEqual({ id: "simulator", state: "unavailable", detail: "license" })
  expect(simulatorStep({ ...ready, hasRuntime: false })).toEqual({ id: "simulator", state: "unavailable", detail: "no-runtime" })
})

test("AXe missing: the board installs it, and says so while it does or why it could not", () => {
  expect(simulatorStep({ ...ready, hasAxe: false })).toEqual({ id: "simulator", state: "missing" })
  expect(simulatorStep({ ...ready, hasAxe: false, job: { phase: "brew" } })).toEqual({ id: "simulator", state: "working", detail: "brew" })
  expect(simulatorStep({ ...ready, hasAxe: false, job: { phase: "error", error: "Homebrew (brew.sh) is needed" } })).toEqual({ id: "simulator", state: "missing", detail: "Homebrew (brew.sh) is needed" })
})
