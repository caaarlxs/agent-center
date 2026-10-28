// Signed in with another Claude account: the app shows only that account's
// sessions. A session seen only in another account opens by importing it
// (lib/desktop.ts appHostOf), and its board item follows it to the new id it
// gets there (lib/board.ts carryOver).

import { expect, test } from "bun:test"
import { carryOver, type Board } from "../lib/board"
import { appHostOf, type DesktopIndex, type DesktopSession } from "../lib/desktop"

const session = (hostId: string, cliId: string, account: string, lastActivityAt: number): DesktopSession => ({
  hostId, cliId, account, title: null, cwd: null, isArchived: false, isStarred: false, lastActivityAt,
  permissionMode: null, model: null, effort: null, suggestions: {}, spawnedFrom: null,
})

function index(active: string | null, ...sessions: DesktopSession[]): DesktopIndex {
  const byHost = new Map(sessions.map(s => [s.hostId, s]))
  const byCli = new Map<string, DesktopSession>()
  const hostsByCli = new Map<string, Set<string>>()
  for (const s of [...sessions].sort((a, b) => (a.lastActivityAt ?? 0) - (b.lastActivityAt ?? 0))) {
    byCli.set(s.cliId!, s)
    hostsByCli.set(s.cliId!, new Set([...(hostsByCli.get(s.cliId!) ?? []), s.hostId]))
  }
  return { ok: true, byCli, byHost, hostsByCli, activeAccount: active }
}

test("a session of the account signed in opens by its own id", () => {
  const d = index("new", session("local_a", "cli-a", "new", 2))
  expect(appHostOf("cli-a", null, d)).toBe("local_a")
})

test("a session seen only in another account has no id here: it is imported", () => {
  const d = index("new", session("local_old", "cli-b", "old", 5))
  expect(appHostOf("cli-b", "local_old", d)).toBeNull() // the hook still names the old one
})

test("once imported, its copy in the account signed in is the one", () => {
  const d = index("new", session("local_old", "cli-c", "old", 5), session("local_cli-c", "cli-c", "new", 9))
  expect(appHostOf("cli-c", "local_old", d)).toBe("local_cli-c")
})

test("without the app's config, the newest copy as before", () => {
  const d = index(null, session("local_old", "cli-d", "old", 5))
  expect(appHostOf("cli-d", null, d)).toBe("local_old")
})

test("a card's place, colour, name and notes follow it to its new id", () => {
  const b: Board = {
    items: { local_old: { pos: { x: 10, y: 20 }, color: "teal", title: "Mine" } },
    notes: [{ id: "n1", text: "hi", x: 0, y: 0, w: 1, h: 1, color: "yellow", cardId: "local_old" }],
  }
  expect(carryOver(b, "local_cli-c", ["local_old", "local_cli-c"])).toBe(true)
  expect(b.items).toEqual({ "local_cli-c": { pos: { x: 10, y: 20 }, color: "teal", title: "Mine" } })
  expect(b.notes![0]!.cardId).toBe("local_cli-c")
  expect(carryOver(b, "local_cli-c", ["local_old"])).toBe(false) // already there: nothing moves
})
