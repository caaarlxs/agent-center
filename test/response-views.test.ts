import { expect, test } from "bun:test"
import { responseViews } from "../lib/response-views"

const url = "http://127.0.0.1:7790/view?session={session}&message={message}&level={level}&embed=1"

test("keeps a URL with a level and the levels to switch to", () => {
  expect(responseViews({ url, levels: [{ id: "concept", label: " High level " }], minChars: 1500 })).toEqual({ url, levels: [{ id: "concept", label: "High level" }], minChars: 1500 })
  expect(responseViews({ url, levels: [{ id: "a", label: "A" }] })?.minChars).toBe(0)
})

test("is off when the setting is missing or wrong", () => {
  expect(responseViews(undefined)).toBeNull()
  expect(responseViews({ url: "http://x/view", levels: [{ id: "a", label: "A" }] })).toBeNull()
  expect(responseViews({ url: "javascript:{level}", levels: [{ id: "a", label: "A" }] })).toBeNull()
  expect(responseViews({ url, levels: [{ id: "A B", label: "x" }, { id: "b" }] })).toBeNull()
})
