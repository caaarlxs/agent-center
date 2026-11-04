import { describe, expect, test } from "vitest"
import { catalogueOf, findIn, newSince, piecesOf } from "./guide"
import { ICONS } from "./icons"

const MD = `# Title

Intro that is not a feature.

## {layout-grid} Views

- {inbox} **Inbox**: one list.
- {search} **Search**: \`/\` or \`⌘K\`, every conversation. · 2026-11-03

## {shapes} Canvas

- {sticky-note} **Notes**: tick the box. · 2026-11-04
`

describe("catalogueOf", () => {
  test("reads each section, its icon and its features: icon, title, text and the day it is new from", () => {
    expect(catalogueOf(MD)).toEqual([
      { name: "Views", icon: "layout-grid", items: [
        { icon: "inbox", title: "Inbox", text: "One list.", since: null },
        { icon: "search", title: "Search", text: "`/` or `⌘K`, every conversation.", since: "2026-11-03" },
      ] },
      { name: "Canvas", icon: "shapes", items: [{ icon: "sticky-note", title: "Notes", text: "Tick the box.", since: "2026-11-04" }] },
    ])
  })
})

describe("piecesOf", () => {
  test("splits a text into words and keys", () => {
    expect(piecesOf("`/` or `⌘K`, all")).toEqual([{ key: "/" }, { text: " or " }, { key: "⌘K" }, { text: ", all" }])
  })
})

describe("findIn", () => {
  const sections = catalogueOf(MD)
  test("keeps the features with every word, in the title or the text, and the sections that have some", () => {
    expect(findIn(sections, "SEARCH conversation")).toEqual([{ ...sections[0]!, items: [sections[0]!.items[1]] }])
  })
  test("a word matches the start of a word: \"con\" finds conversation, not \"icon\"", () => {
    const s = catalogueOf("## {x} Tabs\n- {x} **A**: conversation.\n- {x} **B**: an icon.\n")
    expect(findIn(s, "con")[0]!.items.map(i => i.title)).toEqual(["A"])
  })
  test("a section's name matches all its features", () => expect(findIn(sections, "canvas")).toEqual([sections[1]]))
  test("no words: everything", () => expect(findIn(sections, "  ")).toEqual(sections))
})

describe("newSince", () => {
  const sections = catalogueOf(MD)
  test("the features dated after the day given, newest first, with their section", () => {
    expect(newSince(sections, "2026-11-02").map(f => `${f.section}/${f.title}`)).toEqual(["Canvas/Notes", "Views/Search"])
    expect(newSince(sections, "2026-11-04")).toEqual([])
  })
})

describe("FEATURES.md", () => {
  test("every section has features; every line parsed whole, with a known icon and a well-formed day", async () => {
    const md = (await import("../../../../FEATURES.md?raw")).default
    const sections = catalogueOf(md)
    expect(sections.length).toBeGreaterThan(3)
    for (const s of sections) {
      expect(s.items.length).toBeGreaterThan(0)
      expect(ICONS[s.icon], s.icon).toBeDefined()
    }
    for (const f of sections.flatMap(s => s.items)) {
      expect(f.title, f.text).not.toBe("")
      expect(ICONS[f.icon], `${f.title}: ${f.icon}`).toBeDefined()
      expect(f.text).not.toMatch(/·\s*\d/)
      if (f.since) expect(Number.isNaN(Date.parse(f.since))).toBe(false)
    }
    const lines = md.split("\n").filter(l => l.startsWith("- ")).length
    expect(sections.flatMap(s => s.items).length).toBe(lines)
  })
})
