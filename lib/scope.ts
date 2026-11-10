// What a ticket in the pipeline takes in: the ticket you picked and everything
// under it, at any depth, assigned to you. It is one piece of work: one card,
// one refine, one plan, one build, one review, one release. The ticket you
// picked, if it is not yours (someone's epic), is only context: nothing is
// written on it.

export type TreeTicket = { key: string; kind: string; parent: string | null; summary: string; isMine: boolean }
export type Story = { key: string; subtasks: string[] }

// The children delivered on their own (not sub-tasks, not epics); on a ticket not yours,
// only the ones assigned to you: Run mine shows how many.
type Tree = { children: { key: string; kind: string; isMine?: boolean }[] }
export const deliverablesOf = (t: Tree, onlyMine = false): string[] =>
  t.children.filter(c => c.kind !== "subtask" && c.kind !== "epic" && (!onlyMine || c.isMine)).map(c => c.key)

// Yours, under the root (the tree holds only what is under it).
export const scopeOf = (tree: TreeTicket[]) => tree.filter(t => t.isMine)

// The tickets that move as a story does in Jira: the root if yours, and every
// one of yours that is not a sub-task; each with its own sub-tasks of yours.
export function storiesOf(root: { key: string; isMine: boolean }, scope: TreeTicket[]): Story[] {
  const keys = [...(root.isMine ? [root.key] : []), ...scope.filter(t => t.kind !== "subtask").map(t => t.key)]
  return keys.map(key => ({ key, subtasks: scope.filter(t => t.kind === "subtask" && t.parent === key).map(t => t.key) }))
}

// Where a [Fix] goes: under the story its criterion is of, else the first story.
export const fixParent = (ticket: string | null | undefined, stories: Story[]) =>
  stories.find(s => s.key === ticket)?.key ?? stories[0]?.key ?? null

// The scope, for the agent: which tickets are the work (yours), as a list.
export const scopeLines = (root: { key: string; summary: string; isMine: boolean }, scope: TreeTicket[]) =>
  [...(root.isMine ? [`- ${root.key} · ${root.summary} (el ticket elegido)`] : []), ...scope.map(t => `- ${t.key} · ${t.summary} (${t.kind}${t.parent ? `, en ${t.parent}` : ""})`)].join("\n")
