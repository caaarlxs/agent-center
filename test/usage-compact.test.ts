import { expect, it } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compactedTo, scannedAt } from "../lib/usage"

const reply = (context: number) =>
  JSON.stringify({ type: "assistant", timestamp: "2026-11-11T14:40:00.000Z", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 0, cache_read_input_tokens: context, output_tokens: 0 } } })
const boundary = (post: number, sidechain = false) =>
  JSON.stringify({ type: "system", subtype: "compact_boundary", isSidechain: sidechain, compactMetadata: { trigger: "manual", preTokens: 956_336, postTokens: post } })

it("reads the context a compaction left, only the main conversation's", () => {
  expect(compactedTo(boundary(22_136))).toBe(22_136)
  expect(compactedTo(boundary(22_136, true))).toBe(null)
  expect(compactedTo(reply(500_000))).toBe(null)
})

it("a compacted conversation is as long as its summary, before it answers again", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "usage-")), "s.jsonl")
  await writeFile(path, [reply(956_000), boundary(22_136)].join("\n") + "\n")
  expect((await scannedAt(path)).lastContext).toBe(22_136)
})
