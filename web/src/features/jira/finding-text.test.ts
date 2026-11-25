import { describe, expect, it } from "bun:test"
import { fixAsk, linkName, linksIn, platformsLine } from "./finding-text"

const f = (id: string, story: string) => ({ id, story, env: "staging" as const, what: "", expected: "", platforms: ["ios" as const], images: [], links: [], at: 1 })

describe("findings in the view", () => {
  it("says what Fix with build writes in Jira before it does", () => {
    expect(fixAsk([f("PP-1-H1", "PP-1"), f("PP-1-H2", "PP-1"), f("PP-2-H1", "PP-2")])).toBe("Sure? 3 [Fix] in Jira, PP-1, PP-2 reopened")
  })
  it("takes each link once from what you paste", () => {
    expect(linksIn("mira https://www.figma.com/design/a?node-id=1-2 y https://x.dev/p, https://x.dev/p")).toEqual(["https://www.figma.com/design/a?node-id=1-2", "https://x.dev/p"])
  })
  it("names a Figma node by its node, any other link by its host", () => {
    expect(linkName("https://www.figma.com/design/a?node-id=1-2")).toBe("Figma · 1-2")
    expect(linkName("https://www.deale.es/app")).toBe("deale.es/app")
  })
  it("lists the platforms by their names", () => {
    expect(platformsLine(["ios", "android"])).toBe("iOS · Android")
  })
})
