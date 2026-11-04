import { describe, expect, test } from "vitest"
import { catalogueOf, findIn, newSince } from "./guide"

const MD = `# Title

Intro that is not a feature.

## Views

- Inbox: one list.
- Search (/ or ⌘K): every conversation. · 2026-11-03

## Canvas

- Notes: tick the box. · 2026-11-04
`

describe("catalogueOf", () => {
  test("reads each group and its lines, with the day a line is new from", () => {
    expect(catalogueOf(MD)).toEqual([
      { name: "Views", items: [{ text: "Inbox: one list.", since: null }, { text: "Search (/ or ⌘K): every conversation.", since: "2026-11-03" }] },
      { name: "Canvas", items: [{ text: "Notes: tick the box.", since: "2026-11-04" }] },
    ])
  })
})

describe("findIn", () => {
  const groups = catalogueOf(MD)
  test("keeps the lines with every word, in any case, and the groups that have some", () => {
    expect(findIn(groups, "SEARCH conversation")).toEqual([{ name: "Views", items: [groups[0]!.items[1]] }])
  })
  test("a word matches the start of a word: \"pr\" finds PRs, not \"compress\"", () => {
    const g = catalogueOf("## Tabs\n- PRs: the pull requests.\n- Compress the files.\n")
    expect(findIn(g, "pr")[0]!.items.map(i => i.text)).toEqual(["PRs: the pull requests."])
  })
  test("a group's name matches all its lines", () => {
    expect(findIn(groups, "canvas")).toEqual([groups[1]])
  })
  test("no words: everything", () => expect(findIn(groups, "  ")).toEqual(groups))
})

describe("newSince", () => {
  const groups = catalogueOf(MD)
  test("the lines dated after the day given, newest first", () => {
    expect(newSince(groups, "2026-11-02").map(i => i.text)).toEqual(["Notes: tick the box.", "Search (/ or ⌘K): every conversation."])
    expect(newSince(groups, "2026-11-04")).toEqual([])
  })
})

describe("FEATURES.md", () => {
  test("has groups, each with lines, and only well-formed days", async () => {
    const md = (await import("../../../../FEATURES.md?raw")).default
    const groups = catalogueOf(md)
    expect(groups.length).toBeGreaterThan(3)
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0)
    for (const i of groups.flatMap(g => g.items)) {
      expect(i.text).not.toMatch(/·\s*\d/) // a day the parser did not take
      if (i.since) expect(Number.isNaN(Date.parse(i.since))).toBe(false)
    }
  })
})
