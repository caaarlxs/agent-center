import { expect, test } from "vitest"
import { actionUrl, answerEnds, answerRuns, viewUrl } from "./response-actions"

const say = (key: string) => ({ key, kind: "assistant" })
const ask = (key: string) => ({ key, kind: "user" })
const run = (key: string) => ({ key, kind: "tools" })

test("each finished turn gets its last answer text, after any tool run", () => {
  const shown = [ask("u1"), say("a1:0"), run("t1"), say("a2:0"), ask("u2"), say("a3:0"), say("a3:1")]
  expect([...answerEnds(shown, false)]).toEqual(["a2:0", "a3:1"])
})

test("the running turn gets none, and a turn with no text gets none", () => {
  const shown = [ask("u1"), run("t1"), ask("u2"), say("a1:0")]
  expect([...answerEnds(shown, true)]).toEqual([])
})

test("the URL carries the session and the answer's message id, encoded", () => {
  expect(actionUrl("http://127.0.0.1:7790/view?session={session}&message={message}", "s 1", "m-1:2")).toBe("http://127.0.0.1:7790/view?session=s%201&message=m-1")
})

const text = (key: string, t: string) => ({ key, kind: "assistant", text: t })

test("a turn's answer is its texts at the end, with no tool run between", () => {
  const shown = [ask("u1"), text("a1:0", "first"), run("t1"), text("a2:0", "ab"), text("a2:1", "cde"), ask("u2"), text("a3:0", "x")]
  expect([...answerRuns(shown, false)]).toEqual([["a2:0", { keys: ["a2:0", "a2:1"], chars: 5 }], ["a3:0", { keys: ["a3:0"], chars: 1 }]])
  expect([...answerRuns(shown, true).keys()]).toEqual(["a2:0"])
})

test("a level's URL carries the level too", () => {
  expect(viewUrl("http://h/view?s={session}&m={message}&l={level}", "s", "m:0", "concept")).toBe("http://h/view?s=s&m=m&l=concept")
})
