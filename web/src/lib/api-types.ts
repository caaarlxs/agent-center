// What the server answers, typed by the server itself: the web app imports
// these types from lib/ (type only, nothing of the server is bundled), so a
// change there shows here as a compile error, never as a surprise at run time.
export type { Column, Overlap, Snapshot } from "@server/snapshot"
import type { Snapshot } from "@server/snapshot"
// A card as the snapshot sends it: with its overlaps and its memory.
export type Card = Snapshot["cards"][number]
export type { Zone, Note } from "@server/board"
export type { Changes, FileDiff } from "@server/changes"
export type { CodeTree, Match, Mark } from "@server/code"
export type { Pr, PrDetail } from "@server/github"
export type { Limits, Permission, Question } from "@server/bridge"
export type { Item } from "@server/transcript"
export type { PlanStep } from "@server/plan-op"
export type { Digest, DigestEntry, DigestGroup } from "@server/digest"
export type { RunState } from "@server/runner"
export type { Step, StepState } from "@server/setup"
export type { BridgeStatus } from "@server/bridge"
import type { BridgeStatus } from "@server/bridge"
// GET /api/sessions/:id/bridge: the mod's state, the background wake, and
// whether the app archived the session.
export type Bridge = BridgeStatus & { wake: { tries: number; untrusted: boolean; isOver: boolean } | null; isArchived: boolean }
export type { SuggestionState } from "@server/desktop"
