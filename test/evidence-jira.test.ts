import { describe, expect, it } from "bun:test"
import { forJira } from "../lib/evidence"

const f = (name: string) => ({ name, caption: null })
const results = [
  { status: "pass", files: [f("T1-p1.png"), f("T1-teaser.pdf"), f("T1-p2.png")] },
  { status: "fail", files: [f("T2-response.json"), f("T2-en.png")] },
]
describe("what goes to Jira of a test's evidence", () => {
  it("the test's pick, of the files it kept, a few at most", () => {
    expect(forJira(["evidence/T1-teaser.pdf", "evidence/gone.png", "T2-en.png"], results, () => false)).toEqual(["T1-teaser.pdf", "T2-en.png"])
    expect(forJira(["T1-p1.png", "T1-p2.png", "T1-teaser.pdf"], results, () => false, 2)).toEqual(["T1-p1.png", "T1-p2.png"])
  })
  it("without a pick, one a criterion: the failing first, a document before a picture before data", () => {
    expect(forJira([], results, () => false)).toEqual(["T2-en.png", "T1-teaser.pdf"])
  })
  it("never one Jira already has as it is", () => {
    expect(forJira(["T1-teaser.pdf", "T2-en.png"], results, n => n === "T1-teaser.pdf")).toEqual(["T2-en.png"])
  })
})
