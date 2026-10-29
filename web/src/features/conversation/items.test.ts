import { expect, test } from "vitest"
import type { Item } from "@/lib/api-types"
import { append, normalize } from "./items"

const user = (key: string, text: string, isMidTurn = false): Item => ({ key, kind: "user", text, at: null, isMidTurn })
const act = (detail: string) => ({ tool: "Bash", title: null, detail })
const tools = (key: string, ...lines: string[]): Item => ({ key, kind: "tools", actions: lines.map(act) })
const next = (key: string, ...labels: string[]): Item => ({ key, kind: "next", recap: "r", ask: "a", actions: labels.map(l => ({ label: l, message: l })) })

test("tool runs read later join the run before them", () => {
  expect(append([tools("a", "Read x")], [tools("b", "Edit y")])).toEqual([{ key: "a", kind: "tools", actions: [act("Read x"), act("Edit y")] }])
})

test("a task list's step moves the list it belongs to", () => {
  const plan: Item = { key: "p", kind: "plan", steps: [{ content: "one", status: "in_progress" }, { content: "two", status: "pending" }] }
  const [moved] = append([plan], [{ key: "s", kind: "planStep", op: { advance: true } }])
  expect(moved.kind === "plan" && moved.steps.map(s => s.status)).toEqual(["completed", "in_progress"])
})

test("the next-step box shows once, at the turn's end, with the reply picked", () => {
  const shown = normalize([user("u1", "go"), next("n1", "Old"), next("n2", "Yes, push", "Not yet"), user("u2", "Yes, push")])
  expect(shown.map(i => i.kind)).toEqual(["user", "next", "user"])
  expect(shown[1]).toMatchObject({ key: "n2", picked: "Yes, push" })
})

test("a turn keeps only its newest task list", () => {
  const plan = (key: string, content: string): Item => ({ key, kind: "plan", steps: [{ content, status: "pending" }] })
  expect(normalize([user("u", "go"), plan("p1", "old"), plan("p2", "new")]).map(i => i.key)).toEqual(["u", "p2"])
})

test("a suggested task Claude took back says so, and the take-back shows nothing", () => {
  const task = (key: string, taskId: string): Item => ({ key, kind: "suggestion", taskId, title: "t", tldr: null, prompt: "p", folder: null })
  const shown = normalize([task("a", "task_1"), task("b", "task_2"), { key: "g", kind: "suggestionGone", taskId: "task_1" }])
  expect(shown.map(i => [i.key, "isGone" in i && i.isGone])).toEqual([["a", true], ["b", false]])
})

test("the files a turn changed show in one box at its end, each file's edits added up", () => {
  const edit = (key: string, path: string, added: number, removed: number): Item => ({ key, kind: "edit", path, added, removed })
  const shown = normalize([user("u1", "go"), edit("e1", "/r/a.py", 3, 1), tools("t", "Read b"), edit("e2", "/r/b.md", 1, 0), edit("e3", "/r/a.py", 2, 0), next("n", "Ok"), user("u2", "Ok")])
  expect(shown.map(i => i.kind)).toEqual(["user", "tools", "edits", "next", "user"])
  expect(shown[2]).toMatchObject({ files: [{ path: "/r/a.py", added: 5, removed: 1 }, { path: "/r/b.md", added: 1, removed: 0 }] })
})
