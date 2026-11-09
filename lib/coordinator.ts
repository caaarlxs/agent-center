// A ticket with children delivered on their own (an epic's stories, a story's
// tasks) runs as their coordinator: it is refined once, as a whole (whether
// its children cover what it asks, in what order they go, the questions they
// share), and then each child runs its own pipeline, a few at a time, in that
// order. A child goes to staging only once what it depends on is there. Sub-
// tasks are never children here: they are their story's own split of the work.
import type { PipelineState } from "./pipeline"

export type Child = { key: string; dependsOn: string[] }
type Tree = { children: { key: string; kind: string; isMine?: boolean }[] }

export const MAX_AT_ONCE = 2

// On a ticket that is not yours (an epic of the team), only the ones assigned to you.
export const deliverablesOf = (t: Tree, onlyMine = false): string[] =>
  t.children.filter(c => c.kind !== "subtask" && c.kind !== "epic" && (!onlyMine || c.isMine)).map(c => c.key)

// The parent's order (its refine.json "children"), only over its own children;
// any it left out go last, in the ticket's order.
export function childrenIn(order: unknown, keys: string[]): Child[] {
  const given = (Array.isArray(order) ? order : [])
    .filter((c: any) => keys.includes(String(c?.key)))
    .map((c: any) => ({ key: String(c.key), dependsOn: (Array.isArray(c.dependsOn) ? c.dependsOn : []).map(String).filter((k: string) => keys.includes(k) && k !== c.key) }))
  const seen = new Set(given.map(c => c.key))
  return [...given, ...keys.filter(k => !seen.has(k)).map(key => ({ key, dependsOn: [] }))]
}

type States = Record<string, PipelineState | null | undefined>

// The children to start now: the ones not started yet, in order, while fewer
// than MAX_AT_ONCE run.
export function toStart(children: Child[], states: States, max = MAX_AT_ONCE): string[] {
  const running = children.filter(c => states[c.key]?.status === "running").length
  return children.filter(c => !states[c.key]).slice(0, Math.max(0, max - running)).map(c => c.key)
}

// What a child waits for before its staging: what it depends on, not in staging yet.
export function waitsFor(key: string, children: Child[], states: States): string[] {
  return (children.find(c => c.key === key)?.dependsOn ?? []).filter(k => !states[k]?.deployed?.staging)
}
