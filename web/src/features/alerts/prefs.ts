// How the board tells you about your sessions, kept in this browser under the
// classic board's keys: the chime, the macOS notification, the Mac reading the
// recap aloud, and the sessions you asked to hear about once (the bell).
import { toast } from "sonner"
import { post } from "@/lib/api"
import { persistedStore } from "@/lib/store"
import { chime } from "./chime"

export type Speech = { mode: "off" | "watched" | "all"; voice: string | null; rate: number | null; lastMode?: "watched" | "all" }

const permission = () => ("Notification" in window ? Notification.permission : "denied")

export const sound = persistedStore<"on" | "off">("sound", "off")
export const notify = persistedStore<"on" | "off" | "blocked">("notify", "off")
export const speech = persistedStore<Speech>("speech", { mode: "off", voice: null, rate: null })
export const watched = persistedStore<string[]>("watched", [])
if (permission() === "denied" && notify.get() === "on") notify.set("blocked")

export const canNotify = () => notify.get() === "on" && permission() === "granted"

export function toggleSound() {
  const next = sound.get() === "on" ? "off" : "on"
  sound.set(next)
  if (next === "on") chime("done") // what you will hear
  toast(next === "on" ? "Sound on: a chime when a session finishes or asks you something" : "Sound off")
}

// The quick switch: off, or back to the last choice.
export function toggleSpeech() {
  const now = speech.get()
  const next: Speech = now.mode === "off" ? { ...now, mode: now.lastMode ?? "all" } : { ...now, mode: "off", lastMode: now.mode }
  speech.set(next)
  if (next.mode === "off") void post("/api/speak/stop").catch(() => {}) // and quiet now
  toast(next.mode === "off" ? "Read aloud off" : `Read aloud on: ${next.mode === "all" ? "every session" : "only sessions with the bell"}`)
}

export function toggleWatch(card: { id: string; title: string }) {
  const list = watched.get()
  const isOn = !list.includes(card.id)
  watched.set(isOn ? [...list, card.id] : list.filter(id => id !== card.id))
  toast(isOn ? `You will hear when “${card.title}” finishes or asks you` : "No more notice for it")
}

export function showNotice(title: string, body: string, onClick?: () => void) {
  try {
    const n = new Notification(title, { body, tag: title, icon: "/icon-192.png" })
    n.onclick = () => (window.focus(), onClick?.(), n.close())
    return null
  } catch (err) {
    return String((err as Error)?.message ?? err)
  }
}

export async function toggleNotify() {
  if (notify.get() === "on") return notify.set("off")
  if (!("Notification" in window)) return void toast("This browser does not support notifications")
  const answer = permission() === "default" ? await Notification.requestPermission() : permission()
  if (answer !== "granted") return (notify.set("blocked"), void toast("Chrome blocks notifications here: turn them on in the site settings"))
  notify.set("on")
  // A first notice right away: proof that the browser and macOS let it through.
  const error = showNotice("Notifications on", "This is how a notification arrives when a session asks you something.")
  toast(error ? `Chrome could not show the notification: ${error}` : "Test notification sent. If you do not see it, check the macOS notification settings for this app")
}
