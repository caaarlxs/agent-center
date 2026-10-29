import { describe, expect, it } from "vitest"
import { type Live, shownLive, turnLine } from "./session-events"

const now = 1_000_000
const live = (over: Partial<Live> = {}): Live => ({ turnId: "t", step: 0, text: "Writing…", done: false, at: now - 100, ...over })

describe("the answer being written", () => {
  it("shows while the model writes it", () => expect(shownLive(live(), 10, null, now)).toBe("Writing…"))
  it("stays after the step ends until the transcript has it", () => {
    expect(shownLive(live({ done: true }), 10, 10, now)).toBe("Writing…")
    expect(shownLive(live({ done: true }), 11, 10, now)).toBeNull()
  })
  it("is not shown once it stopped long ago, or with nothing written", () => {
    expect(shownLive(live({ at: now - 120_000 }), 10, null, now)).toBeNull()
    expect(shownLive(live({ text: "" }), 10, null, now)).toBeNull()
    expect(shownLive(null, 10, null, now)).toBeNull()
  })
})

describe("the turn line (mod v12), as the app's spinner", () => {
  const at = (over: Partial<Live>) => live({ since: now - 5_000, tokens: 29, doing: null, ...over })
  it("counts the turn's time and the tokens written", () => {
    expect(turnLine(at({}), now)).toEqual({ time: "5s", tokens: "29 tokens", doing: null })
    expect(turnLine(at({ since: now - 125_000, tokens: 12_400 }), now)).toMatchObject({ time: "2m 5s", tokens: "12.4k tokens" })
  })
  it("says what it does: thinking, writing, or the tool with what it does", () => {
    expect(turnLine(at({ doing: { kind: "thinking" } }), now)?.doing).toBe("Thinking")
    expect(turnLine(at({ doing: { kind: "writing" } }), now)?.doing).toBe("Writing")
    expect(turnLine(at({ doing: { kind: "tool", tool: "Bash", label: "Reading the PR 47 diff" } }), now)?.doing).toBe("Reading the PR 47 diff")
    expect(turnLine(at({ doing: { kind: "tool", tool: "Read", label: "App.tsx" } }), now)?.doing).toBe("Read · App.tsx")
    expect(turnLine(at({ doing: { kind: "tool", tool: "mcp__github__search_issues" } }), now)?.doing).toBe("search_issues")
  })
  it("nothing from an older mod, without the turn's start", () => expect(turnLine(live(), now)).toBeNull())
})
