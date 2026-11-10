import { describe, expect, it } from "bun:test"
import { deliverablesOf, fixParent, scopeLines, scopeOf, storiesOf, type TreeTicket } from "../lib/scope"

const t = (key: string, kind: string, parent: string | null, isMine = true): TreeTicket => ({ key, kind, parent, summary: `S ${key}`, isMine })
// An epic of someone else: a story of someone else, two of yours (one with sub-tasks), a sub-task of someone else.
const tree = [t("PP-2", "story", "PP-1", false), t("PP-3", "story", "PP-1"), t("PP-4", "story", "PP-1"), t("PP-5", "subtask", "PP-3"), t("PP-6", "subtask", "PP-3", false), t("PP-7", "subtask", "PP-4")]

describe("scopeOf", () => {
  it("is everything under the ticket that is yours, at any depth", () => {
    expect(scopeOf(tree).map(x => x.key)).toEqual(["PP-3", "PP-4", "PP-5", "PP-7"])
  })
})

describe("storiesOf", () => {
  it("each ticket of yours that is not a sub-task, with its sub-tasks of yours; the root only if yours", () => {
    expect(storiesOf({ key: "PP-1", isMine: false }, scopeOf(tree))).toEqual([{ key: "PP-3", subtasks: ["PP-5"] }, { key: "PP-4", subtasks: ["PP-7"] }])
    expect(storiesOf({ key: "PP-9", isMine: true }, [t("PP-10", "subtask", "PP-9")])).toEqual([{ key: "PP-9", subtasks: ["PP-10"] }])
  })
})

describe("fixParent", () => {
  const stories = [{ key: "PP-3", subtasks: [] }, { key: "PP-4", subtasks: [] }]
  it("under the story of the criterion, else the first", () => {
    expect(fixParent("PP-4", stories)).toBe("PP-4")
    expect(fixParent("PP-2", stories)).toBe("PP-3")
    expect(fixParent(null, [])).toBeNull()
  })
})

describe("scopeLines", () => {
  it("lists the work for the agent: the root when yours, then each ticket of yours", () => {
    expect(scopeLines({ key: "PP-1", summary: "Epic", isMine: false }, [t("PP-3", "story", "PP-1")])).toBe("- PP-3 · S PP-3 (story, en PP-1)")
    expect(scopeLines({ key: "PP-9", summary: "Mine", isMine: true }, [])).toBe("- PP-9 · Mine (el ticket elegido)")
  })
})

describe("deliverablesOf", () => {
  const ref = (key: string, kind: string, isMine = true) => ({ key, kind, isMine })
  it("is the children delivered on their own; on a ticket not yours, only yours", () => {
    const epic = { children: [ref("PP-2", "story", false), ref("PP-4", "bug"), ref("PP-5", "subtask"), ref("PP-6", "epic")] }
    expect(deliverablesOf(epic)).toEqual(["PP-2", "PP-4"])
    expect(deliverablesOf(epic, true)).toEqual(["PP-4"])
  })
})
