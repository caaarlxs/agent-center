import { expect, test } from "bun:test"
import { freshPrompt } from "../lib/handoff"
import { continuedFrom, latestOf } from "../lib/task-links"

const OLD = "61c7418a-1111-2222-3333-444455556666"
const user = (content: unknown, extra = {}) => ({ type: "user", message: { role: "user", content }, ...extra })

test("reads which session a Start fresh message continues, from the prompt Start fresh writes", () => {
  const prompt = freshPrompt({ title: "Detalle tareas", note: "## Goal\nShip", transcript: `/Users/ana/.claude/projects/-Users-ana-shop/${OLD}.jsonl` })
  expect(continuedFrom(user(prompt))).toBe(OLD)
  expect(continuedFrom(user([{ type: "text", text: prompt }]))).toBe(OLD)
})

test("ignores the words anywhere else: quoted later, in a tool's output, from Claude, or in a subagent", () => {
  const prompt = freshPrompt({ title: "x", note: "n", transcript: `/p/${OLD}.jsonl` })
  expect(continuedFrom(user(`Look at this: ${prompt}`))).toBeNull()
  expect(continuedFrom(user([{ type: "tool_result", content: prompt }]))).toBeNull()
  expect(continuedFrom({ type: "assistant", message: { content: [{ type: "text", text: prompt }] } })).toBeNull()
  expect(continuedFrom(user(prompt, { isSidechain: true }))).toBeNull()
})

test("follows a chain of Start fresh to the newest session, and stops on a loop", () => {
  const next = new Map([["a", "b"], ["b", "c"], ["x", "y"], ["y", "x"]])
  expect(latestOf("a", next)).toBe("c")
  expect(latestOf("c", next)).toBe("c")
  expect(["x", "y"]).toContain(latestOf("x", next))
})
