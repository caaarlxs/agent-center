// What the server answers, typed by the server itself: the web app imports
// these types from lib/ (type only, nothing of the server is bundled), so a
// change there shows here as a compile error, never as a surprise at run time.
export type { Card, Column, Overlap, Snapshot } from "@server/snapshot"
export type { Zone, Note } from "@server/board"
export type { Changes, FileDiff } from "@server/changes"
export type { CodeTree, Match, Mark } from "@server/code"
export type { Pr, PrDetail } from "@server/github"
export type { Limits, Permission, Question } from "@server/bridge"
