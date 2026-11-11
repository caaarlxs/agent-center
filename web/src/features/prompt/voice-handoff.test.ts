import { beforeEach, expect, test, vi } from "vitest"

const sent: [string, string][] = []
let failSend = false
vi.mock("@/features/conversation/send", () => ({ sendMessage: async (id: string, text: string) => { if (failSend) throw new Error("asleep"); sent.push([id, text]) } }))
vi.mock("@/lib/live", () => ({ live: () => ({ snapshot: { cards: [{ id: "s1", title: "My session" }] } }) }))
vi.mock("@/app/open-session", () => ({ openSession: () => {} }))
vi.mock("@/lib/notify", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {}, warning: () => {}, info: () => {} }) }))

const { handOff, boxOpened, composerAppend } = await import("./voice-handoff")
const { draftOf, keepDraft } = await import("@/features/conversation/drafts")

beforeEach(() => (sent.length = 0, failSend = false, keepDraft("s1", ""), composerAppend.set(null)))

test("left the conversation: it is sent to its session once written, open or not", async () => {
  await handOff("s1", "hola")
  expect(sent).toEqual([["s1", "hola"]])
  const close = boxOpened("s1")
  await handOff("s1", "otra")
  expect(sent.at(-1)).toEqual(["s1", "otra"])
  close()
  expect(draftOf("s1")).toBe("")
})

test("a send that fails keeps the text in the draft, after what was there", async () => {
  failSend = true
  keepDraft("s1", "ya escrito")
  await handOff("s1", "no se pierde")
  expect(draftOf("s1")).toBe("ya escrito no se pierde")
})

test("a send that fails with its box open again: the text waits in the box", async () => {
  failSend = true
  const close = boxOpened("s1")
  await handOff("s1", "al cuadro")
  expect(composerAppend.get()).toEqual({ id: "s1", text: "al cuadro" })
  close()
})
