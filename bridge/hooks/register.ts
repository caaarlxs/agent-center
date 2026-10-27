// Agent Center bridge: runs inside every Claude Code session and delivers the
// messages Agent Center (localhost:7777) leaves for this session, as if
// the person had typed them, and stops the running turn when asked.
// Installed at the person's request.
//
// Files under ~/.claude/agent-center, each with a single writer:
//   outbox/<session>/<msg>.json  { id, text, notBefore }  the server (writes and deletes)
//   control/<session>.json       { stop }                  the server: a stop request
//   settings/<session>.json      { id, mode?, model?, effort? }  the server: a change asked
//                                from the board
//   acks/<session>.json          { delivered, failed, stopped, settings }  this mod
//                                (failed: messages the session refused, with why)
//   alive/<session>.json         { at, busy, v, limits }   this mod (heartbeat; limits:
//                                the account's 5-hour and weekly windows)
//   questions/<session>.json     { id, questions, at }     this mod: the question the
//                                session is asking (AskUserQuestion), while it waits
//   answers/<session>.json       { id, answers }           the server: the board's answer
//                                to that question (answers: question text -> label)
//   permissions/<session>.json   { id, tool, input, at }   this mod: the tool approval the
//                                client asks for now; id null once settled
//   permits/<session>.json       { id, decision }          the server: the board's allow/deny
//
// A message waits in the outbox until the session is free (no turn running)
// and its `notBefore` has passed: until then the server can still take it
// back ("Undo").

import type { EngineInterface, Register } from 'claude-code'

const POLL_MS = 2000
const KEEP_ACKS = 100
const VERSION = 9
const ANSWER_POLL_MS = 1000

type Message = { id: string; text: string; notBefore?: number }
type Bridge = {
  base: string
  id: string // the session's id: a /clear gives the session a new one
  delivered: string[]
  failed: { id: string; reason: string }[] // refused by the session (a hook, a Stop that stands)
  stopped: string | null // the last stop request handled
  settings: { id: string; results: Record<string, string> } | null // the last change handled
  isPolling: boolean
  isApplying: boolean // a settings change in progress (the mode may wait for its approval card)
}

let bridge: Bridge | null = null
let turnId: string | null = null // the main loop's running turn
// Tool approvals the client asks for now (classic.PermissionRequest), by the
// call they belong to (tool + its input), and those the board allowed, which
// the next ask for the same call answers at once.
type Approval = { id: string; tool: string; key: string }
const asking = new Map<string, Approval>()
const allowed = new Set<string>()
// The same call seen from two events may list its arguments in another order.
const sorted = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as any)[k])])) : v
const callKey = (tool: string, input: unknown) => `${tool}:${JSON.stringify(sorted(input))}`
// The approval asked for a call: by its key, or the only one asked for that tool.
function approvalFor(tool: string, key: string) {
  const exact = asking.get(key)
  if (exact) return exact
  const same = [...asking.values()].filter(a => a.tool === tool)
  return same.length === 1 ? same[0]! : null
}
// The tool's arguments, without the engine's own keys around them.
function argsOf(e: Record<string, unknown>) {
  const { tool, tool_use_id, agentId, requestMeta, consent, ...args } = e as any
  return args
}
// The plan's rate-limit windows as the status line has them, asked for by the
// heartbeat once a minute.
type Limit = { kind: string; percentUsed: number; resetsAt?: string }
let limits: { at: number; windows: Limit[] } | null = null
let limitsAskedAt = 0
const LIMITS_EVERY_MS = 60_000

async function writeAcks($: EngineInterface, b: Bridge) {
  await $.fs.write(`${b.base}/acks/${b.id}.json`, JSON.stringify({ delivered: b.delivered, failed: b.failed, stopped: b.stopped, settings: b.settings }))
}

// What this mod already did for the session `b.id` names: delivered ids
// survive a reload, so a message is never sent twice.
async function readAcks($: EngineInterface, b: Bridge) {
  try {
    const acks = JSON.parse(await $.fs.read(`${b.base}/acks/${b.id}.json`))
    b.delivered = acks.delivered ?? []
    b.failed = acks.failed ?? []
    b.stopped = acks.stopped ?? null
    b.settings = acks.settings ?? null
  } catch {
    Object.assign(b, { delivered: [], failed: [], stopped: null, settings: null })
  }
}

// A change of permission mode, model or effort asked from the board. The mode
// goes through the desktop app's own tool, which shows its approval card for
// a mode that asks less; model and effort run as /model and /effort, as if
// typed. Each result is "ok" or the reason it failed.
type SettingsRequest = { id: string; mode?: string; model?: string; effort?: string; at?: number }
// A mode change that could not reach the client is asked again, every
// RETRY_MS, for SETTINGS_PATIENCE_MS: right after a new session is imported
// the client's tools are not connected yet, and a session closed while its
// approval card waited takes the card with it (it shows again when reopened).
const RETRYABLE = /no connected MCP tool|stream closed before response/
// In Auto, the classifier may give no verdict for a change the conversation
// itself did not ask for; it says to ask once more, as is.
const NO_VERDICT = /gave no verdict/
const RETRY_MS = 15_000
const SETTINGS_PATIENCE_MS = 30 * 60_000
let retryAt = 0
async function applySettings($: EngineInterface, b: Bridge) {
  if ((await $.clock.now()) < retryAt) return
  let req: SettingsRequest | null = null
  try {
    req = JSON.parse(await $.fs.read(`${b.base}/settings/${b.id}.json`))
  } catch {
    return
  }
  if (!req?.id || req.id === b.settings?.id) return
  const results: Record<string, string> = {}
  const before = b.settings
  b.settings = { id: req.id, results }
  await writeAcks($, b) // claimed first: never applied twice
  const fail = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300)
  if (req.mode) {
    try {
      const setMode = () => $.mcp.call("ccd_session_mgmt", "set_session_permission_mode", { session_id: "self", mode: req!.mode })
      const r = await setMode().catch(err => (NO_VERDICT.test(fail(err)) ? setMode() : Promise.reject(err)))
      results.mode = r.isError ? fail(JSON.stringify(r.content ?? r)) : "ok"
    } catch (err) {
      const now = await $.clock.now()
      if (RETRYABLE.test(fail(err)) && now - (req.at ?? 0) < SETTINGS_PATIENCE_MS) {
        retryAt = now + RETRY_MS
        b.settings = before // unclaimed: asked again later
        await writeAcks($, b)
        return
      }
      results.mode = fail(err)
    }
  }
  for (const key of ["model", "effort"] as const) {
    if (!req[key]) continue
    try {
      await $.command.run({ command: key, args: req[key] })
      results[key] = "ok"
    } catch (err) {
      results[key] = fail(err)
    }
  }
  b.settings = { id: req.id, results }
  await writeAcks($, b)
}

async function beat($: EngineInterface, b: Bridge) {
  const now = await $.clock.now()
  // Asked again once a minute, and right after a turn (when they move); until
  // the first API answer there is nothing to read, so it keeps asking.
  if (now - limitsAskedAt > LIMITS_EVERY_MS) {
    try {
      const { rateLimits } = await $.session.usage()
      if (rateLimits.length) (limits = { at: now, windows: rateLimits }), (limitsAskedAt = now)
    } catch {}
  }
  await $.fs.write(`${b.base}/alive/${b.id}.json`, JSON.stringify({ at: now, busy: !!turnId, v: VERSION, limits }))
}

// A stop request the mod has not handled yet: end the running turn. A fresh
// one that finds no turn waits a few seconds (a prompt just submitted may not
// have started its turn yet); an older one is spent. Answers whether a turn
// was ended.
const STOP_WAIT_MS = 5000
async function checkStop($: EngineInterface, b: Bridge) {
  let request: { stop?: string; at?: number } = {}
  try {
    request = JSON.parse(await $.fs.read(`${b.base}/control/${b.id}.json`))
  } catch {
    return false
  }
  if (!request.stop || request.stop === b.stopped) return false
  const running = turnId
  if (!running && (await $.clock.now()) - (request.at ?? 0) < STOP_WAIT_MS) return false
  b.stopped = request.stop
  await writeAcks($, b)
  if (!running) return false
  turnId = null
  await $.turn.abort({ turnId: running }).catch(() => {})
  await beat($, b)
  return true
}

async function poll($: EngineInterface) {
  const b = bridge
  if (!b || b.isPolling) return
  b.isPolling = true
  try {
    // A /clear gives the session a new id and starts no new session.
    const id = await $.session.id()
    if (id !== b.id) {
      b.id = id
      await readAcks($, b)
    }
    await beat($, b)
    await checkStop($, b)
    if (turnId) return // busy: the messages wait, and can still be taken back
    // Apart from the poll: a mode change may wait on its approval card, and
    // the heartbeat and the stop checks must go on meanwhile.
    if (!b.isApplying) {
      b.isApplying = true
      void applySettings($, b).finally(() => (b.isApplying = false))
    }
    const now = await $.clock.now()
    const files = await $.fs.list(`${b.base}/outbox/${b.id}`).catch(() => [])
    const names = files
      .filter(f => f.kind === 'file' && f.name.endsWith('.json'))
      .map(f => f.name)
      .sort()
    for (const name of names) {
      const msg = JSON.parse(await $.fs.read(`${b.base}/outbox/${b.id}/${name}`)) as Message
      if (!msg.id || !msg.text || b.delivered.includes(msg.id) || b.failed.some(f => f.id === msg.id)) continue
      if (msg.notBefore && now < msg.notBefore) break // keep the order
      // Claim before submitting: a crash in between loses the message rather
      // than sending it twice.
      b.delivered = [...b.delivered, msg.id].slice(-KEEP_ACKS)
      await writeAcks($, b)
      const result = await $.prompt.submit({ text: msg.text, asUser: true })
      // Refused (a prompt hook, a Stop that stands): the board says why, and
      // the message stays there to take back.
      if ('drop' in result && result.drop) {
        b.delivered = b.delivered.filter(d => d !== msg.id)
        b.failed = [...b.failed, { id: msg.id, reason: String(result.drop).slice(0, 300) }].slice(-20)
        await writeAcks($, b)
      }
      break // one per turn: the next waits until this one is answered
    }
  } catch {
    // A half-written file or a busy disk: try again on the next tick.
  } finally {
    b.isPolling = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const home = await $.env.get('HOME')
    const b: Bridge = {
      base: `${home}/.claude/agent-center`,
      id: await $.session.id(),
      delivered: [],
      failed: [],
      stopped: null,
      settings: null,
      isPolling: false,
      isApplying: false,
    }
    await readAcks($, b)
    bridge = b
    void poll($)
    $.clock.every(POLL_MS, () => void poll($))
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) turnId = e.turnId
    if (bridge) void beat($, bridge)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.turnId === turnId) turnId = null
    limitsAskedAt = 0 // the turn moved the plan's limits
    void poll($) // a message that waited goes now
    return result
  })

  // A question with options (AskUserQuestion) can be answered here or on the
  // board, whichever comes first: the client's own card runs beneath (next),
  // while the question waits in questions/ for the board; an answer from the
  // board returns in its place, which ends the card beneath. The hook's time
  // budget does not run while next is pending.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const b = bridge
    if (!b || e.agentId !== undefined || !e.tool_use_id || (e as any).answers) return next(e)
    const id = e.tool_use_id
    const questionPath = `${b.base}/questions/${b.id}.json`
    await $.fs.write(questionPath, JSON.stringify({ id, questions: (e as any).questions, at: await $.clock.now() }))
    let isSettled = false
    const fromClient = next(e).finally(() => (isSettled = true))
    const fromBoard = (async () => {
      while (!isSettled) {
        await new Promise<void>(resolve => $.clock.after(ANSWER_POLL_MS, () => resolve()))
        try {
          const answer = JSON.parse(await $.fs.read(`${b.base}/answers/${b.id}.json`))
          if (answer?.id === id && answer.answers) return answer.answers as Record<string, string>
        } catch {}
      }
      return null
    })()
    try {
      const first = await Promise.race([fromClient.then(result => ({ result })), fromBoard.then(answers => ({ answers }))])
      if ('result' in first) return first.result
      if (!first.answers) return fromClient
      return { result: { questions: (e as any).questions, answers: first.answers } } as any
    } finally {
      isSettled = true
      // Cleared only while it still holds this question: another may have come since.
      try {
        if (JSON.parse(await $.fs.read(questionPath)).id === id)
          await $.fs.write(questionPath, JSON.stringify({ id: null, at: await $.clock.now() }))
      } catch {}
    }
  })

  // A tool approval the client is about to ask for: noted for the board, then
  // the client's own dialog as always; one the board already allowed for this
  // very call is allowed at once.
  on('classic.PermissionRequest', async ($, e, next) => {
    const b = bridge
    const key = callKey(e.tool_name, e.tool_input)
    const pass = allowed.has(key) ? key : [...allowed].filter(k => k.startsWith(`${e.tool_name}:`)).length === 1 ? [...allowed].find(k => k.startsWith(`${e.tool_name}:`))! : null
    if (pass) return allowed.delete(pass), { decision: { behavior: 'allow' } }
    if (b && !(e as any).agent_id) {
      const approval = { id: crypto.randomUUID(), tool: e.tool_name, key }
      asking.set(key, approval)
      await $.fs.write(`${b.base}/permissions/${b.id}.json`, JSON.stringify({ id: approval.id, tool: e.tool_name, input: e.tool_input, at: await $.clock.now() }))
    }
    return next(e)
  })

  // Each tool call is also a chance to honour a stop request that came while
  // the last tool ran; the call itself then does not run. While the call runs,
  // an approval the client asks for can be settled on the board instead: deny
  // ends the call (and the client's dialog), allow runs it again, allowed.
  on('tool.call', async ($, e, next) => {
    const b = bridge
    if (b && turnId && (await checkStop($, b))) return { deny: 'Stopped from Agent Center' }
    if (!b || e.agentId !== undefined || e.tool === 'AskUserQuestion') return next(e)
    const key = callKey(e.tool, argsOf(e as any))
    let isSettled = false
    const fromClient = next(e).finally(() => (isSettled = true))
    const fromBoard = (async () => {
      while (!isSettled) {
        await new Promise<void>(resolve => $.clock.after(ANSWER_POLL_MS, () => resolve()))
        const approval = approvalFor(e.tool, key)
        if (!approval) continue
        try {
          const permit = JSON.parse(await $.fs.read(`${b.base}/permits/${b.id}.json`))
          if (permit?.id === approval.id && (permit.decision === 'allow' || permit.decision === 'deny')) return permit.decision as 'allow' | 'deny'
        } catch {}
      }
      return null
    })()
    try {
      const first = await Promise.race([fromClient.then(result => ({ result })), fromBoard.then(decision => ({ decision }))])
      if ('result' in first) return first.result
      if (!first.decision) return fromClient
      if (first.decision === 'deny') return { deny: 'Denied from Agent Center' }
      allowed.add(key)
      return await $.tool.call({ tool: e.tool, ...argsOf(e as any) } as any)
    } finally {
      isSettled = true
      const approval = approvalFor(e.tool, key)
      if (approval) asking.delete(approval.key)
      allowed.delete(key)
      try {
        const path = `${b.base}/permissions/${b.id}.json`
        if (approval && JSON.parse(await $.fs.read(path)).id === approval.id) await $.fs.write(path, JSON.stringify({ id: null, at: await $.clock.now() }))
      } catch {}
    }
  })
}
