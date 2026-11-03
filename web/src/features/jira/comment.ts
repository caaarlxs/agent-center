// A ticket's comment as the ticket shows it: the pipeline's (they start with
// lib/pipeline.ts's MARK) say who wrote them and their title on their own.
export const AGENT_MARK = "🤖 Agent Center"

export function readComment(body: string): { isAgent: boolean; title: string | null; text: string } {
  const lead = body.trimStart()
  if (!lead.startsWith(AGENT_MARK)) return { isAgent: false, title: null, text: body }
  const [first = "", ...rest] = lead.split("\n")
  return { isAgent: true, title: first.slice(AGENT_MARK.length).replace(/^\s*·\s*/, "").trim() || null, text: rest.join("\n").trim() }
}
