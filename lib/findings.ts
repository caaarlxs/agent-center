// Findings: what a person found trying a ticket in staging or prod (QA, design), as the
// test finds it. Each one says what happens and what should happen, where (web, the app
// on iOS or Android, the backend), the story of the ticket it is about, and its proof:
// screenshots and links (a Figma node). It is a draft until you fix it: then it goes into
// the test as a criterion that fails (asResult), with a [Fix] in Jira under its story, and
// a build fixes it as it fixes what the test found (test.fix.json, new PRs).
//
// They live in <data>/pipeline/<KEY>/found.json (the drafts, and the ones in the test, for
// what they say); their images in its evidence/ folder, served as the test's are.
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { writeJsonAtomic } from "./files"
import { evidenceType, MAX_BYTES } from "./evidence"
import type { Env, PipelineStatus, Stage, TestResult } from "./pipeline"

export const PLATFORMS = ["web", "ios", "android", "backend"] as const
export type Platform = (typeof PLATFORMS)[number]
const PLATFORM_NAME: Record<Platform, string> = { web: "Web", ios: "iOS", android: "Android", backend: "Backend" }
export type FoundInput = { story: string; env: Env; what: string; expected: string; platforms: Platform[]; images: string[]; links: string[] }
export type PersonFinding = FoundInput & { id: string; at: number }

const textOf = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const isLink = (s: string) => /^https?:\/\/\S+$/.test(s)

const required = (v: unknown, refusal: string) => {
  const text = textOf(v)
  if (!text) throw new Error(refusal)
  return text
}
const isPlatform = (p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p)
function platformsIn(v: unknown): Platform[] {
  const platforms = listOf(v).map(textOf)
  if (!platforms.length || !platforms.every(isPlatform)) throw new Error("Say where: web, iOS, Android or backend")
  return [...new Set(platforms as Platform[])]
}
const isImage = (name: string) => name.startsWith("found-") && !!evidenceType(name)?.startsWith("image/")

// What a person sent, checked once where it comes in.
export function findingIn(v: any, stories: string[]): FoundInput {
  const story = textOf(v?.story)
  if (!stories.includes(story)) throw new Error(`${story || "No story"}: not a story of this ticket`)
  return {
    story, env: v?.env === "prod" ? "prod" : "staging",
    what: required(v?.what, "Say what happens"), expected: required(v?.expected, "Say what should happen"), platforms: platformsIn(v?.platforms),
    images: listOf(v?.images).map(textOf).filter(isImage), links: listOf(v?.links).map(textOf).filter(isLink),
  }
}

// The story's next finding: H1, H2… after every id the ticket has of it.
export function nextId(story: string, taken: string[]) {
  const re = new RegExp(`^${story}-H(\\d+)$`)
  const n = Math.max(0, ...taken.map(id => Number(id.match(re)?.[1] ?? 0)))
  return `${story}-H${n + 1}`
}

// In the test: a criterion that fails, of its story, with its proof.
export const asResult = (f: PersonFinding): TestResult => ({
  id: f.id, criterion: `Hallazgo. ${f.expected}`, status: "fail", ticket: f.story, by: "person",
  summary: `${f.what}\nDebería: ${f.expected}`,
  evidence: [`Encontrado por una persona en ${f.env}: ${f.platforms.map(p => PLATFORM_NAME[p]).join(", ")}.`, ...f.links].join("\n"),
  files: f.images.map(name => ({ name, caption: null })),
})
// The ones not in the test yet: you can still change them.
export const drafts = (found: PersonFinding[], results: Pick<TestResult, "id">[] = []) => found.filter(f => !results.some(r => r.id === f.id))
// What an agent needs of one (a build that fixes it, a test that tries it again).
export const forAgent = (f: PersonFinding, dir: string) =>
  ({ id: f.id, story: f.story, what: f.what, expected: f.expected, platforms: f.platforms, images: f.images.map(n => join(dir, "evidence", n)), links: f.links })

// A test that ends: its results, over the person's findings it did not try, over the earlier test's.
const over = (base: TestResult[], top: TestResult[]) => [...base.filter(r => !top.some(t => t.id === r.id)), ...top]
export const keepFound = (earlier: TestResult[], person: TestResult[], now: TestResult[]) => over(over(earlier, person), now)
export const byPerson = (results: TestResult[] = []) => results.filter(r => r.by === "person")

// Fix with build: once staging or prod (or its test or check) has ended.
const AFTER_STAGING: Stage[] = ["staging", "test", "prod", "smoke"]
export function canFix(state: { stage: Stage; status: PipelineStatus }): string | null {
  if (state.status === "running") return "A stage runs: wait for it to end"
  if (!AFTER_STAGING.includes(state.stage)) return "Findings are fixed from Staging or Prod"
  if (state.status !== "ready") return "Finish the stage at hand first"
  return null
}

// ---------- on disk ----------

const fileOf = (dir: string) => join(dir, "found.json")
export async function readFound(dir: string): Promise<PersonFinding[]> {
  try {
    return listOf(JSON.parse(await readFile(fileOf(dir), "utf8"))?.found) as PersonFinding[]
  } catch {
    return []
  }
}
export const writeFound = (dir: string, found: PersonFinding[]) => writeJsonAtomic(fileOf(dir), { found }, { pretty: true })

// A screenshot pasted or dropped: into evidence/, named found-<time>-<random>.<ext>.
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }
export async function saveImage(dir: string, type: string, body: ArrayBuffer) {
  const ext = IMAGE_EXT[type]
  if (!ext) throw new Error("Only PNG, JPEG, GIF or WebP images")
  if (!body.byteLength) throw new Error("The image is empty")
  if (body.byteLength > MAX_BYTES) throw new Error("The image is larger than 10 MB")
  await mkdir(join(dir, "evidence"), { recursive: true })
  const name = `found-${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`
  await Bun.write(join(dir, "evidence", name), body)
  return name
}
