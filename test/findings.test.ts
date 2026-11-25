import { describe, expect, test } from "bun:test"
import { asResult, drafts, findingIn, forAgent, keepFound, nextId, canFix } from "../lib/findings"

const stories = ["PP-3270", "PP-3406"]
const input = { story: "PP-3406", env: "staging", what: "Las pestañas son píldoras", expected: "Pestañas subrayadas, como en Figma", platforms: ["ios", "android"], images: ["found-1.png"], links: ["https://www.figma.com/design/abc?node-id=1-2"] }

describe("a finding as a person writes it", () => {
  test("takes what happens, what should happen, where, the story, images and links", () => {
    expect(findingIn(input, stories)).toEqual({ story: "PP-3406", env: "staging", what: "Las pestañas son píldoras", expected: "Pestañas subrayadas, como en Figma", platforms: ["ios", "android"], images: ["found-1.png"], links: ["https://www.figma.com/design/abc?node-id=1-2"] })
  })
  test("refuses a story that is not the ticket's", () => {
    expect(() => findingIn({ ...input, story: "PP-1" }, stories)).toThrow("not a story of this ticket")
  })
  test("refuses one with no text or no platform", () => {
    expect(() => findingIn({ ...input, what: " " }, stories)).toThrow("what happens")
    expect(() => findingIn({ ...input, expected: "" }, stories)).toThrow("what should happen")
    expect(() => findingIn({ ...input, platforms: [] }, stories)).toThrow("where")
    expect(() => findingIn({ ...input, platforms: ["tv"] }, stories)).toThrow("where")
  })
  test("keeps only web links and evidence names", () => {
    const f = findingIn({ ...input, links: ["javascript:alert(1)", " https://x.dev/a "], images: ["../state.json", "found-2.jpg"] }, stories)
    expect(f.links).toEqual(["https://x.dev/a"])
    expect(f.images).toEqual(["found-2.jpg"])
  })
})

describe("its id", () => {
  test("is the story's next H after the ones taken", () => {
    expect(nextId("PP-3270", ["PP-3270-H1", "PP-3270-CA2", "PP-3406-H4"])).toBe("PP-3270-H2")
    expect(nextId("PP-3406", [])).toBe("PP-3406-H1")
  })
})

const found = { id: "PP-3406-H1", at: 1, ...findingIn(input, stories) }

describe("a finding in the test", () => {
  test("is a criterion that fails, of its story, by a person, with its images", () => {
    const r = asResult(found)
    expect(r).toMatchObject({ id: "PP-3406-H1", status: "fail", ticket: "PP-3406", by: "person", criterion: "Hallazgo. Pestañas subrayadas, como en Figma" })
    expect(r.summary).toContain("Las pestañas son píldoras")
    expect(r.evidence).toContain("iOS, Android")
    expect(r.evidence).toContain("https://www.figma.com/design/abc?node-id=1-2")
    expect(r.files).toEqual([{ name: "found-1.png", caption: null }])
  })
  test("a draft is one not in the test yet", () => {
    expect(drafts([found], [])).toEqual([found])
    expect(drafts([found], [asResult(found)])).toEqual([])
  })
})

describe("for the agents", () => {
  test("its images go by their full path, with what it says", () => {
    expect(forAgent(found, "/d")).toEqual({ id: "PP-3406-H1", story: "PP-3406", what: found.what, expected: found.expected, platforms: ["ios", "android"], images: ["/d/evidence/found-1.png"], links: found.links })
  })
})

describe("a test that ends", () => {
  const pass = { id: "PP-3270-CA1", criterion: "x", status: "pass" as const, evidence: "" }
  test("keeps the person's findings it did not try", () => {
    expect(keepFound([pass], [asResult(found)], [])).toEqual([pass, asResult(found)])
  })
  test("what it tried of them is its result", () => {
    const now = { ...asResult(found), status: "pass" as const, by: undefined }
    expect(keepFound([pass], [asResult(found)], [now])).toEqual([pass, now])
  })
})

describe("Fix with build", () => {
  const ready = { stage: "staging" as const, status: "ready" as const }
  test("goes from staging, its test, prod or its check, once they end", () => {
    for (const stage of ["staging", "test", "prod", "smoke"] as const) expect(canFix({ stage, status: "ready" })).toBeNull()
    expect(canFix({ stage: "build", status: "ready" })).toBe("Findings are fixed from Staging or Prod")
    expect(canFix({ ...ready, status: "running" })).toBe("A stage runs: wait for it to end")
  })
})
