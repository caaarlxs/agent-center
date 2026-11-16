// A ticket's comment as the ticket shows it: the pipeline's (they start with
// lib/pipeline.ts's MARK) say who wrote them and their title on their own.
export const AGENT_MARK = "🤖 Agent Center"

export function readComment(body: string): { isAgent: boolean; title: string | null; text: string } {
  const lead = body.trimStart()
  if (!lead.startsWith(AGENT_MARK)) return { isAgent: false, title: null, text: body }
  const [first = "", ...rest] = lead.split("\n")
  return { isAgent: true, title: first.slice(AGENT_MARK.length).replace(/^\s*·\s*/, "").trim() || null, text: rest.join("\n").trim() }
}

// Your answers to a stage's questions as the board writes them to Jira (lib/pipeline.ts
// answersComment): a heading, then each question and, after its arrow, the answer.
export type Answered = { id: string; question: string; answer: string }
export function readAnswers(body: string): Answered[] | null {
  const text = readComment(body).text.trim()
  if (!/^Respuestas a las preguntas del/.test(text)) return null
  const blocks = text.split(/\n(?=Q\d+\.\s)/).slice(1)
  const answered = blocks.map(b => b.match(/^(Q\d+)\.\s+([\s\S]*?)\n\s*→\s*([\s\S]*)$/)).filter((m): m is RegExpMatchArray => !!m)
  return answered.length ? answered.map(([, id, question, answer]) => ({ id: id!, question: question!.trim(), answer: answer!.trim() })) : null
}
// The answers of the latest such comment of a ticket.
export const lastAnswers = (comments: { body: string }[]) => comments.map(c => readAnswers(c.body)).filter(Boolean).at(-1) ?? null
