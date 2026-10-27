import { expect, test } from "vitest"
import { kindOf, parseDelimited } from "./kinds"

test("a file's kind comes from its extension, a few from their name", () => {
  expect(kindOf("README.md")).toBe("markdown")
  expect(kindOf("report.DOCX")).toBe("document")
  expect(kindOf("app.tsx")).toBe("code")
  expect(kindOf("Dockerfile")).toBe("code")
  expect(kindOf("deck.key")).toBe("other")
})

test("CSV: quoted cells keep their commas and doubled quotes", () => {
  expect(parseDelimited('a,b\n"x, y","say ""hi"""\r\nlast,', ",", 10)).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["last", ""]])
})

test("CSV: stops at the row limit", () => {
  expect(parseDelimited("1\n2\n3\n", ",", 2)).toEqual([["1"], ["2"]])
})

test("sound plays as audio", () => expect(kindOf("memo.mp3")).toBe("audio"))
