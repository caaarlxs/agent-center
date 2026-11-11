import { expect, test } from "vitest"
import { kindOf, splitText } from "./notify-kind"

test("a failure is an error", () => {
  for (const t of ["Could not send", "Could not transcribe: your audio is kept", "Failed to load", "The browser has no permission to use the microphone", "Something went wrong", "Dictation stopped: network"])
    expect(kindOf(t), t).toBe("error")
})

test("something done is a success", () => {
  for (const t of ["Message sent", "Copied", "Answer sent", "Saved", "Your dictation went to “X”", "Replied: “ok”", "Sound on: a chime when a session finishes", "Pushed"])
    expect(kindOf(t), t).toBe("success")
})

test("something to watch for is a warning", () => {
  for (const t of ["Archived in Claude: unarchive it there", "The answer did not reach the session: answer it in Claude", "Reply queued: it arrives when the session is free", "Nobody waits for you"])
    expect(kindOf(t), t).toMatch(/warning|info/)
  expect(kindOf("Archived in Claude: unarchive it there")).toBe("warning")
})

test("anything else is information", () => {
  expect(kindOf("A new pack arrived!")).toBe("info")
})

test("a long text with a reason splits into a title and its detail", () => {
  expect(splitText("Could not transcribe: your audio is kept", undefined)).toEqual({ title: "Could not transcribe", description: "Your audio is kept" })
  expect(splitText("Message sent", undefined)).toEqual({ title: "Message sent", description: undefined })
  expect(splitText("Replied: “ok”", undefined)).toEqual({ title: "Replied: “ok”", description: undefined }) // a quote is the message itself
  expect(splitText("A: b", "given")).toEqual({ title: "A: b", description: "given" })
})
