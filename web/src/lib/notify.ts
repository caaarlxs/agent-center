// Toasts, as Sonner's `toast` with the same calls, given a kind when they
// have none: an error, a success, a warning or information, read from their
// words (notify-kind.ts), for the icon and colour the Toaster gives each
// kind (components/ui/sonner.tsx). A long note with a reason shows as a title
// and its detail; and each carries how long it stays, for its time bar.
import { type ExternalToast, toast as sonner } from "sonner"
import { kindOf, splitText } from "./notify-kind"

const DEFAULT_MS = 4500 // as the Toaster's

type Message = Parameters<typeof sonner>[0]

// How long it stays, for the bar that runs out with it (none for one that stays).
const withLife = (data?: ExternalToast): ExternalToast => {
  const ms = data?.duration ?? DEFAULT_MS
  return Number.isFinite(ms) ? { ...data, style: { ...data?.style, "--life": `${ms}ms` } as React.CSSProperties } : { ...data }
}

function show(message: Message, data?: ExternalToast) {
  if (typeof message !== "string") return sonner(message, withLife(data))
  const { title, description } = splitText(message, data?.description === undefined ? undefined : "")
  const shaped = withLife({ ...data, description: data?.description ?? description })
  if (data?.icon) return sonner(title, shaped) // its own icon (a pet, a moment): no kind
  return sonner[kindOf(message)](title, shaped)
}

function errorOf(message: Message, data?: ExternalToast) {
  if (typeof message !== "string") return sonner.error(message, withLife(data))
  const { title, description } = splitText(message, data?.description === undefined ? undefined : "")
  return sonner.error(title, withLife({ ...data, description: data?.description ?? description }))
}

export const toast = Object.assign(show, sonner, { error: errorOf })
