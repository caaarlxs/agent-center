import { expect, it } from "vitest"
import { callOf } from "./CustomizeButton"

it("lights up as the card would: a question first, then an answer not read", () => {
  expect(callOf({ column: "asking", isUnread: true })).toBe("asks")
  expect(callOf({ column: "review", isUnread: true })).toBe("unread")
  expect(callOf({ column: "working", isUnread: false })).toBeNull()
  expect(callOf({ column: "pending", isUnread: false })).toBeNull()
})
