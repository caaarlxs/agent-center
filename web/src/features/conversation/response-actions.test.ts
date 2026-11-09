import { expect, test } from "vitest"
import { actionUrl, answerEnds } from "./response-actions"

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
