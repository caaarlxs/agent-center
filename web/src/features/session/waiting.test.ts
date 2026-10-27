import { expect, test } from "vitest"
import type { Card } from "@/lib/api-types"
import { nextAfter, waitingOf } from "./waiting"

const card = (id: string, column: string, extra: Partial<Card> = {}) => ({ id, column, state: "done", waitingSince: null, lastActivity: 0, ...extra }) as Card

test("approvals first, then questions, then new work to review, each oldest first", () => {
  const cards = [
    card("review-new", "review", { lastActivity: 50 }),
    card("ask-late", "asking", { state: "asking", waitingSince: 30 }),
    card("permit", "asking", { state: "permission", waitingSince: 40 }),
    card("ask-early", "asking", { state: "asking", waitingSince: 10 }),
    card("review-old", "review", { lastActivity: 5 }),
    card("working", "working"),
  ]
  expect(waitingOf(cards).map(c => c.id)).toEqual(["permit", "ask-early", "ask-late", "review-old", "review-new"])
})

test("next goes round, and starts at the first", () => {
  const list = waitingOf([card("a", "review", { lastActivity: 1 }), card("b", "review", { lastActivity: 2 })])
  expect(nextAfter(list, null)?.id).toBe("a")
  expect(nextAfter(list, "a")?.id).toBe("b")
  expect(nextAfter(list, "b")?.id).toBe("a")
  expect(nextAfter([], "a")).toBeNull()
})
