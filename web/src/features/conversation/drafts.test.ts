import { beforeEach, expect, test } from "vitest"
import { appendToDraft, draftOf, joinText, keepDraft } from "./drafts"

beforeEach(() => keepDraft("s1", ""))

test("dictation joins what is written with a space", () => {
  expect(joinText("", "hola")).toBe("hola")
  expect(joinText("tengo esto  ", "y más")).toBe("tengo esto y más")
})

test("a dictation that lands while the chat is closed goes to the end of its draft", () => {
  keepDraft("s1", "primero")
  appendToDraft("s1", "después")
  expect(draftOf("s1")).toBe("primero después")
  appendToDraft("s2", "solo")
  expect(draftOf("s2")).toBe("solo")
})
