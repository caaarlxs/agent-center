# Architecture

Agent Center has four parts: a hook and a plugin that run inside Claude Code, a server, and a
page. They talk through files on disk and a local HTTP server.

```
Claude desktop ──runs──▶ Claude Code sessions ──hook──▶ ~/.claude/session-inbox/<id>.json
                              ▲    │                                │
                bridge mod ───┘    └──transcripts──▶ ~/.claude/projects/**.jsonl
                     │                                              │
     ~/.claude/agent-center (outbox, answers, heartbeat…)           │
                     │                                              ▼
                     └────────────────▶  server (Bun, 127.0.0.1) ◀── reads
                                              │  server-sent events
                                     the page in your browser
```

## The parts

### The hook: `hooks/session-inbox.py`

A Claude Code hook, in Python, that runs on session events. It records, per session, whether the
session works, asks or finished, what it asks, and the recap of its last turn, in
`~/.claude/session-inbox/<id>.json`. Only the hook writes these files.

### The bridge mod: `bridge/`

A Claude Code plugin (`agent-center-bridge`) that runs inside every session. It is how the board
acts on a session: it submits the board's messages as your prompt, answers questions and tool
approvals, stops turns, applies mode, model and effort changes, streams the answer as it is
written, and reports the plan limits.

The mod and the server share files under `~/.claude/agent-center/`. Each file has one writer.

| File | Writer | What |
|---|---|---|
| `outbox/<session>/<msg>.json` | server | A message to deliver, with the time it may go (`notBefore`) |
| `control/<session>.json` | server | A request to stop the turn |
| `settings/<session>.json` | server | A mode, model or effort change |
| `overrides/<session>.json` | server | The effort to put on every request to the model |
| `answers/<session>.json` | server | The board's answer to a question |
| `permits/<session>.json` | server | The board's allow or deny for a tool approval |
| `acks/<session>.json` | mod | Messages delivered or refused, stops, changes applied |
| `alive/<session>.json` | mod | A heartbeat every 2 seconds: busy or not, mod version, plan limits, process |
| `questions/<session>.json` | mod | The question the session asks while it waits |
| `permissions/<session>.json` | mod | The tool approval the session asks for now |
| `stream/<session>.json` | mod | The answer as the model writes it |

The mod has a protocol version (`v` in its heartbeat). The server checks it before it asks for
something an older mod does not know (`lib/diagnose.ts`).

### The server: `server.ts`, `routes/`, `lib/`

A Bun server on `127.0.0.1`. `server.ts` guards every request (see
[Privacy and security](privacy.md#how-the-server-is-guarded)), serves the page and starts the
background work. The routes are split by what they do:

- `routes/read.ts`: everything the page reads. GET only.
- `routes/session.ts`: what the page does to one session: messages, answers, stop, settings,
  waking it, forks, runs, start fresh, and the board's own actions on its card (pin, park, done,
  move, rename, colour, tier).
- `routes/write.ts`: board-wide actions: new sessions, Catch me up, canvas zones and notes, PR
  actions, tasks, sent files, dictation, Jira and the Pipeline.

The server combines its sources into one **snapshot** of the board (`lib/snapshot.ts`): the hook's
records, Claude desktop's own session records, the transcripts, the mod's files and your own
decisions. `lib/live.ts` recomputes it every second while a window listens and pushes only what
changed, over server-sent events. An open conversation has its own event stream
(`lib/session-events.ts`), so it reads the transcript only when it grows.

Transcripts can be hundreds of MB and only grow. Every reader of them (`transcript.ts`,
`usage.ts`, `search.ts`, `prs.ts`, `plan.ts`…) reads only what was added since its last pass.

### The page: `web/`

A React app (TypeScript, Vite, Tailwind, shadcn/ui, React Flow), built into `web/dist` and served
by the server. It imports the server's types from `lib/`, so a change on one side that breaks the
other fails to compile.

- `web/src/app/`: the shell, routing between views and dialogs.
- `web/src/features/<feature>/`: one folder per feature (board, canvas, conversation, pipeline,
  spend…), with its components, pure logic and tests side by side.
- `web/src/lib/`: shared state, the API client, the live snapshot, formatting.
- `web/src/components/`: shared UI components.
- `/design` (in the running app): every component with made-up data.

## Where state lives

| What | Where | Writer |
|---|---|---|
| Your decisions on the board (pins, columns, canvas, zones, notes, names, colours, tiers) | `<state>/data/board.json` | `lib/board.ts`, and only it |
| Your choices | `<state>/settings.json` | `lib/setup.ts` |
| A Pipeline ticket's runs | `<state>/data/pipeline/<KEY>/` | `lib/pipeline.ts` |
| Session state | `~/.claude/session-inbox/` | the hook |
| Shared with the mod | `~/.claude/agent-center/` | see the table above |

One writer per file is a rule of the code: it keeps every file consistent without locks.

## How a message reaches a session

1. You send a message. The server writes it to the session's outbox, with a time 5 seconds
   ahead. Until the mod takes it, you can take it back.
2. If the session is awake, the mod takes the message when no turn runs, submits it as your
   prompt and acknowledges it.
3. If the session sleeps (no heartbeat), the server wakes it with Claude desktop's link
   `claude://code/continue` (`lib/wake.ts`), every 20 seconds, up to 4 times. Once the session
   runs, the mod takes the message.
4. If Claude desktop runs no more sessions, the server runs the turn itself: Claude Code resumes
   the same session headless (`claude -p --resume`), with its folder, mode, model and effort
   (`lib/deliver.ts`).

## How a new session starts

The first turn runs headless (`claude -p`) in the chosen folder, with the first message
(`lib/launch.ts`). The hooks then show it on the board. Claude desktop imports it with
`claude://resume?session=<id>`, which keeps its id.

## The repository

| Path | What |
|---|---|
| `server.ts` | The server's entry: guard, static files, background work |
| `routes/` | HTTP routes |
| `lib/` | The server's modules, one concern each; every file starts with a comment that says what it does |
| `web/` | The page |
| `bridge/` | The bridge mod (a Claude Code plugin) |
| `hooks/session-inbox.py` | The session hook |
| `extras/organizer/` | The optional task list (`organizer.py`) |
| `scripts/` | The demo server, the uninstaller's Claude Code part, the icon generator |
| `test/` | The server's tests (Bun) |
| `docs/` | This documentation and the README's images |
| `FEATURES.md` | Every feature in one line; the app shows it as its guide |
| `install.sh`, `uninstall.sh` | Install and remove |

### The server's modules by area

| Area | Modules |
|---|---|
| Sessions and the board | `snapshot`, `live`, `live-patch`, `sessions`, `desktop`, `board`, `repo`, `memory`, `processes`, `background`, `saying`, `retrying` |
| Talking to sessions | `bridge`, `wake`, `deliver`, `launch`, `client`, `fork`, `handoff`, `diagnose` |
| Conversations | `transcript`, `session-events`, `search`, `plan`, `plan-op`, `trace`, `tests`, `widgets`, `response-actions`, `response-views` |
| Code and files | `changes`, `session-changes`, `session-commits`, `code`, `session-files`, `uploads`, `office`, `monaco`, `editor-theme`, `commands`, `runner`, `servers` |
| GitHub | `github`, `prs` |
| Costs | `usage`, `spend`, `limits` |
| Claude calls | `digest` (Catch me up), `suggest` (the next message), `handoff` (Start fresh) |
| Jira and the Pipeline | `jira`, `jira-flow`, `adf`, `pipeline`, `scope`, `release`, `checks`, `conflicts`, `gate`, `jobs`, `activity`, `evidence`, `proposals`, `debt`, `cleanup`, `sent-back` |
| Setup and the Mac | `setup`, `config`, `freshness`, `version`, `speech`, `transcribe`, `app-icon`, `memory-log`, `client-errors` |
| Tasks | `organizer`, `task-links` |
| Pets | `pets`, `pet-levels`, `community-pets` |
| Helpers | `files`, `proc`, `http` |

## Credits

- The Code tab's editor, [Monaco](https://github.com/microsoft/monaco-editor) (MIT, © Microsoft),
  is downloaded from npm on first use (`lib/monaco.ts`).
- File and folder icons: VS Code's [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT), loaded on first use.
- The menus, tooltips, dialogs, hover cards, tabs and select animate with
  [Animate UI](https://animate-ui.com) (`@animate-ui/react`, MIT + Commons Clause): used here as a
  dependency inside the app; its components are not redistributed on their own.
- Some icons and motions come from [Lucide Animated](https://lucide-animated.com) and
  [Icona](https://icona.works), and some components are adapted from
  [Watermelon UI](https://ui.watermelon.sh), all MIT.
- The page's other packages (`web/package.json`) keep their own licences.
