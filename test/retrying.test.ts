import { describe, expect, it } from "bun:test"
import { retryOf } from "../lib/retrying"

const NOW = Date.parse("2026-11-04T12:00:30Z")
const apiError = (at: string, attempt = 2, max = 10, retryInMs = 5000) => ({ type: "system", subtype: "api_error", timestamp: at, retryAttempt: attempt, maxRetries: max, retryInMs })
const claude = (at: string) => ({ type: "assistant", timestamp: at, message: { content: [] } })

describe("retryOf", () => {
  it("is the attempt when the last row is a retry of the API, recent", () => {
    expect(retryOf([claude("2026-11-04T12:00:00Z"), apiError("2026-11-04T12:00:20Z", 3, 10)], NOW)).toEqual({ kind: "retrying", attempt: 3, max: 10 })
  })
  it("is nothing once Claude answered again", () => {
    expect(retryOf([apiError("2026-11-04T12:00:20Z"), claude("2026-11-04T12:00:25Z")], NOW)).toBeNull()
  })
  it("is nothing for an old retry, long past its wait", () => {
    expect(retryOf([apiError("2026-11-04T11:58:00Z", 2, 10, 5000)], NOW)).toBeNull()
  })
  it("is nothing for an API error that is not retried", () => {
    expect(retryOf([{ type: "system", subtype: "api_error", timestamp: "2026-11-04T12:00:20Z" }], NOW)).toBeNull()
  })
  it("leaves out a subagent's rows", () => {
    expect(retryOf([apiError("2026-11-04T12:00:20Z"), { ...claude("2026-11-04T12:00:25Z"), isSidechain: true }], NOW)).toEqual({ kind: "retrying", attempt: 2, max: 10 })
  })
})
