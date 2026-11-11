// What kind of note a toast is, from its words, for its icon and colour: an
// error, a success, a warning or information. And a long note with a reason
// ("Could not send: the session is asleep") as a title and its detail. Pure:
// tested on its own.

export type Kind = "error" | "success" | "warning" | "info"

const ERROR = /^(could ?n[o']t|cannot|can't|failed|error|unable)|\b(went wrong|has no permission|did not (work|start|open)|stopped: )/i
const WARNING = /^(archived|nothing|nobody|no (pack|session|one)|already)|did not reach|\b(asleep|queued|over the limit|too (big|many|long))\b/i
const SUCCESS = /\b(sent|saved|copied|done|created|merged|pushed|opened|added|removed|moved|renamed|linked|unlinked|replied|deleted|archived it|restored|went to|turned on|is on|answer sent|started|updated|cleared|stopped it|finished|reached)\b|\b(on|off):/i

export function kindOf(text: string): Kind {
  if (ERROR.test(text)) return "error"
  if (WARNING.test(text)) return "warning"
  if (SUCCESS.test(text)) return "success"
  return "info"
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Title: detail" as both, when no detail is given and the detail is not a quote. */
export function splitText(text: string, description: string | undefined) {
  const at = text.indexOf(": ")
  if (description !== undefined || at < 3 || at > 60) return { title: text, description }
  const rest = text.slice(at + 2).trim()
  if (!rest || /^[“"']/.test(rest)) return { title: text, description }
  return { title: text.slice(0, at), description: cap(rest) }
}
