import { describe, expect, test } from "vitest"
import type { Card } from "@/lib/api-types"
import { dropAction, inboxGroups, runsOf } from "./columns"
import { canvasOrder, stepFrom, walkOrder } from "./order"
import { patchOf, settle, withOverrides } from "./overrides"
import { byRank, emptyText, ranksAt, tierOf, tierStep, toTier } from "./tiers"

const card = (id: string, extra: Partial<Card> = {}) =>
  ({ id, column: "review", pinned: false, repoRoot: "/r", repo: "r", tier: "other", pos: null, isUnread: false, title: id, ...extra }) as Card

describe("inbox", () => {
  test("pinned first, then one group per column; empty groups hide but Asking you", () => {
    const groups = inboxGroups([card("a", { pinned: true }), card("b"), card("c", { column: "done" })], false)
    expect(groups.map(g => [g.key, g.cards.map(c => c.id)])).toEqual([["pinned", ["a"]], ["asking", []], ["review", ["b"]]])
  })
  test("Done shows only when asked for", () => {
    expect(inboxGroups([card("c", { column: "done", pinned: true })], true).map(g => g.key)).toEqual(["asking", "done"])
  })
})

test("a drop on a column: Later parks, Done marks done, Pending marks seen, out of Later unparks", () => {
  expect(dropAction(card("a"), "parked")).toEqual(["park", { until: null }])
  expect(dropAction(card("a"), "done")).toEqual(["done", {}])
  expect(dropAction(card("a"), "pending")).toEqual(["seen", {}])
  expect(dropAction(card("a", { column: "parked" }), "review")).toEqual(["unpark", {}])
  expect(dropAction(card("a"), "working")).toBeNull()
  expect(dropAction(card("a"), "review")).toBeNull()
})

test("consecutive cards of one repo stack; the order never changes", () => {
  const runs = runsOf([card("a"), card("b"), card("c", { repoRoot: "/s", repo: "s" }), card("d")])
  expect(runs.map(r => r.cards.map(c => c.id))).toEqual([["a", "b"], ["c"], ["d"]])
})

describe("tiers", () => {
  test("a row keeps the order the person gave, never the activity's", () => {
    const row = [card("c", { tierRank: null }), card("b", { tierRank: 2048 }), card("a", { tierRank: 1024 }), card("d", { tierRank: null })]
    expect([...row].sort(byRank).map(c => c.id)).toEqual(["a", "b", "c", "d"])
  })
  test("a place between two neighbours, or the whole row numbered when some had none", () => {
    const ranked = [card("a", { tierRank: 1024 }), card("b", { tierRank: 2048 })]
    expect(ranksAt(ranked, "x", 1)).toEqual([["x", 1536]])
    expect(ranksAt(ranked, "x", 0)).toEqual([["x", 512]])
    expect(ranksAt(ranked, "x", 2)).toEqual([["x", 3072]])
    expect(ranksAt([card("a", { tierRank: null }), card("b", { tierRank: null })], "b", 0)).toEqual([["b", 1024], ["a", 2048]])
  })

  test("a card's row: Done closes, Later pauses, else its own (other by default)", () => {
    expect(tierOf(card("a", { column: "done" }))).toBeNull()
    expect(tierOf(card("a", { column: "parked", tier: "main" }))).toBe("paused")
    expect(tierOf(card("a", { tier: "fixes" }))).toBe("fixes")
    expect(tierOf(card("a", { tier: "nonsense" }))).toBe("other")
  })
  test("moving takes it out of Done or Later first", () => {
    expect(toTier(card("a", { column: "done" }), "main")).toEqual([["undone", {}], ["tier", { tier: "main" }]])
    expect(toTier(card("a"), "paused")).toEqual([["park", { until: null }]])
    expect(toTier(card("a"), "other")).toBeNull()
  })
  test("[ and ] step one row, and stop at the ends", () => {
    expect(tierStep(card("a", { tier: "main" }), -1)).toBeNull()
    expect(tierStep(card("a", { tier: "main" }), 1)).toBe("fixes")
    expect(tierStep(card("a", { column: "parked" }), 1)).toBeNull()
    expect(tierStep(card("a", { column: "done" }), -1)).toBeNull()
  })
  test("an empty row says what a drop there does", () => {
    expect(emptyText("paused", false)).toBe("Drag a card here to pause it")
    expect(emptyText("main", true)).toBe("Drop here")
  })
})

describe("keyboard order", () => {
  test("inbox: pinned first, then by column", () => {
    const cards = [card("w", { column: "working" }), card("a", { column: "asking" }), card("p", { pinned: true, column: "working" })]
    expect(walkOrder("inbox", cards, false, "none", []).map(c => c.id)).toEqual(["p", "a", "w"])
  })
  test("board by repo: lane by lane", () => {
    const cards = [card("x", { repoRoot: "/s" }), card("y", { column: "asking" })]
    expect(walkOrder("board", cards, false, "repo", [{ root: "/s" }, { root: "/r" }]).map(c => c.id)).toEqual(["x", "y"])
  })
  test("canvas: top to bottom, then left to right", () => {
    const cards = [card("b", { pos: { x: 0, y: 200 } }), card("c", { pos: { x: 400, y: 0 } }), card("a", { pos: { x: 0, y: 0 } })]
    expect(canvasOrder(cards).map(c => c.id)).toEqual(["a", "c", "b"])
  })
  test("a step stops at the ends; from nothing it starts at an end", () => {
    const order = [card("a"), card("b")]
    expect(stepFrom(order, null, 1)?.id).toBe("a")
    expect(stepFrom(order, null, -1)?.id).toBe("b")
    expect(stepFrom(order, "b", 1)?.id).toBe("b")
  })
})

describe("optimistic changes", () => {
  test("a patch stands until the server agrees, or 6 seconds pass", () => {
    const ov = { a: { ...patchOf("pin")!, at: 0 } }
    expect(settle(ov, [card("a")], 1000)).toBe(ov)
    expect(settle(ov, [card("a", { pinned: true })], 1000)).toEqual({})
    expect(settle(ov, [card("a")], 7000)).toEqual({})
  })
  test("the cards show their patches; archived ones leave", () => {
    const shown = withOverrides([card("a"), card("b")], { a: { column: "archived", at: 0 }, b: { pinned: true, at: 0 } })
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ id: "b", pinned: true })
    expect(shown[0]).not.toHaveProperty("at")
  })
})
