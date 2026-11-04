import { describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evidenceType, filesIn, keptFiles } from "../lib/evidence"

describe("evidenceType", () => {
  it("serves pictures, PDFs and data as what they are", () => {
    expect(evidenceType("T1-desktop.png")).toBe("image/png")
    expect(evidenceType("T3-teaser.pdf")).toBe("application/pdf")
    expect(evidenceType("T2-response.json")).toBe("application/json; charset=utf-8")
    expect(evidenceType("T4-rows.csv")).toBe("text/csv; charset=utf-8")
  })
  it("serves nothing that could run in the page, and nothing outside the folder", () => {
    expect(evidenceType("T1.html")).toBeNull()
    expect(evidenceType("T1.svg")).toBeNull()
    expect(evidenceType("../state.json")).toBeNull()
    expect(evidenceType("a/b.png")).toBeNull()
  })
})

describe("filesIn", () => {
  it("reads each file of a criterion: its name in evidence/ and what it shows", () => {
    expect(filesIn([{ path: "evidence/T1-desktop.png", caption: "Escritorio" }, { path: "T1-mobile.png" }, { path: "../x.png" }, { path: "evidence/T1.html" }, "nada"]))
      .toEqual([{ name: "T1-desktop.png", caption: "Escritorio" }, { name: "T1-mobile.png", caption: null }])
  })
})

describe("keptFiles", () => {
  it("keeps only the files that are there, and not too big", () => {
    const dir = mkdtempSync(join(tmpdir(), "evidence-"))
    mkdirSync(join(dir, "evidence"))
    writeFileSync(join(dir, "evidence", "T1.png"), "png")
    expect(keptFiles(dir, [{ name: "T1.png", caption: null }, { name: "T2.png", caption: null }])).toEqual([{ name: "T1.png", caption: null }])
  })
})
