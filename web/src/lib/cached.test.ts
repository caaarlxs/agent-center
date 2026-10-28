import { afterEach, describe, expect, it, vi } from "vitest"
import { cachedGet } from "./cached"

const answer = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
afterEach(() => vi.restoreAllMocks())

describe("cachedGet", () => {
  it("keeps the last answer, and one request for two asks at once", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => answer({ n: 1 }))
    const c = cachedGet<{ n: number }>("/api/x")
    expect(c.get()).toBeNull()
    await Promise.all([c.load(), c.load()])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(c.get()).toEqual({ n: 1 })
  })

  it("asks again later, and keeps the old answer until the new one is there", async () => {
    let n = 0
    vi.spyOn(globalThis, "fetch").mockImplementation(() => answer({ n: ++n }))
    const c = cachedGet<{ n: number }>("/api/x")
    await c.load()
    const next = c.load()
    expect(c.get()).toEqual({ n: 1 })
    await next
    expect(c.get()).toEqual({ n: 2 })
  })
})
