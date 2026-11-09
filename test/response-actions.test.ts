import { expect, test } from "bun:test"
import { responseActions } from "../lib/response-actions"

test("keeps actions with a label and a web URL, at most four", () => {
  const ok = { label: " View ", url: "http://127.0.0.1:7790/view?session={session}&message={message}" }
  expect(responseActions([ok])).toEqual([{ label: "View", url: ok.url }])
  expect(responseActions(Array(6).fill(ok))).toHaveLength(4)
})

test("leaves out what is not an action", () => {
  expect(responseActions(undefined)).toEqual([])
  expect(responseActions({ label: "x", url: "http://a" })).toEqual([])
  expect(responseActions([{ label: "", url: "http://a" }, { label: "x", url: "javascript:alert(1)" }, { label: "x" }, null, "x"])).toEqual([])
})
