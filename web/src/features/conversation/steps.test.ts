import { expect, test } from "vitest"
import { foldedSteps } from "./steps"

const say = (key: string) => ({ key, kind: "assistant" })
const ask = (key: string) => ({ key, kind: "user" })
const run = (key: string, n = 1) => ({ key, kind: "tools", actions: Array(n).fill({}) })
const other = (key: string, kind: string) => ({ key, kind })

test("a finished turn folds its steps and keeps its answer", () => {
  const shown = [ask("u1"), say("a1"), run("t1", 2), say("a2"), run("t2", 3), say("a3"), say("a4"), ask("u2")]
  const { heads, hidden } = foldedSteps(shown, false)
  expect([...heads]).toEqual([["a1", { keys: ["a1", "t1", "a2", "t2"], actions: 5 }]])
  expect([...hidden]).toEqual(["a1", "t1", "a2", "t2"])
})

test("the running turn stays open, the last finished one folds", () => {
  const shown = [ask("u1"), run("t1"), say("a1"), ask("u2"), say("a2"), run("t2"), say("a3")]
  expect([...foldedSteps(shown, true).heads.keys()]).toEqual(["t1"])
  expect([...foldedSteps(shown, false).heads.keys()]).toEqual(["t1", "a2"])
})

test("what you see or answer stays in place: questions, files", () => {
  const shown = [ask("u1"), run("t1"), other("q1", "question"), run("t2"), other("f1", "files"), say("a1")]
  const { heads, hidden } = foldedSteps(shown, false)
  expect(heads.get("t1")?.keys).toEqual(["t1", "t2"])
  expect(hidden.has("q1") || hidden.has("f1")).toBe(false)
})

test("a turn with no answer text, or no steps, folds nothing", () => {
  expect(foldedSteps([ask("u1"), run("t1"), ask("u2")], false).heads.size).toBe(0)
  expect(foldedSteps([ask("u1"), say("a1"), ask("u2")], false).heads.size).toBe(0)
})

test("test runs fold with the steps", () => {
  const shown = [ask("u1"), run("t1"), other("x1", "tests"), other("x2", "tests"), say("a1")]
  expect(foldedSteps(shown, false).heads.get("t1")?.keys).toEqual(["t1", "x1", "x2"])
})

test("the files changed box folds too, also after the answer", () => {
  const shown = [ask("u1"), run("t1"), say("a1"), other("e1", "edits"), ask("u2")]
  const { heads, hidden } = foldedSteps(shown, false)
  expect(heads.get("t1")?.keys).toEqual(["t1", "e1"])
  expect(hidden.has("a1")).toBe(false)
})
