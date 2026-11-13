import { describe, expect, it } from "vitest"
import type { PipelineState } from "@server/pipeline"
import type { Release } from "@server/release"
import { releaseShown } from "./pipeline-board"

const last = { env: "staging", steps: [] } as Release
const next = { env: "staging", steps: [] } as unknown as Release
const at = (stage: string) => ({ key: "PP-1", stage, status: "ready", release: last } as unknown as PipelineState)
describe("the release a column shows", () => {
  it("the one about to start when a fix waits at its door; the one that ran while it is there", () => {
    expect(releaseShown(at("review"), next, "staging")).toBe(next)
    expect(releaseShown(at("staging"), next, "staging")).toBe(last)
    expect(releaseShown(at("test"), null, "staging")).toBe(last)
  })
})
