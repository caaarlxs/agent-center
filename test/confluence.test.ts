import { describe, expect, it } from "bun:test"
import { confluenceIds } from "../lib/jira"

describe("confluenceIds", () => {
  it("finds the Confluence pages a text links to, each once, in order", () => {
    const text = `Ver [funcional](https://deale.atlassian.net/wiki/spaces/COM/pages/880771074/C+mo+usamos+Jira) y
      https://deale.atlassian.net/wiki/pages/viewpage.action?pageId=123 y otra vez /wiki/spaces/COM/pages/880771074`
    expect(confluenceIds([text, null])).toEqual(["880771074", "123"])
  })
  it("leaves alone what is not a Confluence page", () => {
    expect(confluenceIds(["https://github.com/o/r/pull/7", "PP-3093"])).toEqual([])
  })
})
