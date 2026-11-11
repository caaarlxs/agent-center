import { beforeEach, expect, test, vi } from "vitest"

const sent: [string, string][] = []
let failSend = false
vi.mock("@/features/conversation/send", () => ({ sendMessage: async (id: string, text: string) => { if (failSend) throw new Error("asleep"); sent.push([id, text]) } }))
vi.mock("@/lib/live", () => ({ live: () => ({ snapshot: { cards: [{ id: "s1", title: "My session" }] } }) }))
vi.mock("@/app/open-session", () => ({ openSession: () => {} }))
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {} }) }))

const { handOff, boxOpened, composerAppend } = await import("./voice-handoff")
const { draftOf, keepDraft } = await import("@/features/conversation/drafts")

beforeEach(() => (sent.length = 0, failSend = false, keepDraft("s1", ""), composerAppend.set(null)))

test("pressed Enter before leaving: it is sent to its session", async () => {
  await handOff("s1", "hola", true)
  expect(sent).toEqual([["s1", "hola"]])
  expect(draftOf("s1")).toBe("")
})

test("not sent: it goes to the session's draft, after what was there", async () => {
  keepDraft("s1", "ya escrito")
  await handOff("s1", "y dictado", false)
  expect(draftOf("s1")).toBe("ya escrito y dictado")
})

test("its box open again: the text goes into it, not to the draft", async () => {
  const close = boxOpened("s1")
  await handOff("s1", "al cuadro", false)
  expect(composerAppend.get()).toEqual({ id: "s1", text: "al cuadro" })
  expect(draftOf("s1")).toBe("")
  close()
})

test("a send that fails keeps the text in the draft", async () => {
  failSend = true
  await handOff("s1", "no se pierde", true)
  expect(draftOf("s1")).toBe("no se pierde")
})
