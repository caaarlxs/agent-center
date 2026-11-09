import { expect, test } from "vitest"
import { placeOf, samePlace, walkTo } from "./history-walk"

test("a step through history opens, swaps, closes or leaves the panel", () => {
  expect(walkTo("a", "a")).toBe("stay")
  expect(walkTo(null, "a")).toBe("close")
  expect(walkTo("a", null)).toBe("open")
  expect(walkTo("b", "a")).toBe("swap")
  expect(walkTo(null, null)).toBe("stay")
})

test("a place is the view, the session open and its tab; old entries had the session only", () => {
  const here = { view: "canvas", reader: "a", tab: "chat" } as const
  expect(samePlace(here, { ...here })).toBe(true)
  expect(samePlace(here, { ...here, view: "tickets" })).toBe(false)
  expect(samePlace(here, { ...here, tab: "commits" })).toBe(false)
  expect(samePlace({ ...here, reader: null, tab: "commits" }, { ...here, reader: null, tab: null })).toBe(true) // no session: no tab
  expect(placeOf({ reader: "a" }, "inbox")).toEqual({ view: "inbox", reader: "a", tab: "chat" })
  expect(placeOf(null, "board")).toEqual({ view: "board", reader: null, tab: null })
  expect(placeOf({ view: "tickets", reader: null, tab: null }, "board")).toEqual({ view: "tickets", reader: null, tab: null })
})
