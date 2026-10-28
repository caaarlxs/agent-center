# Agent Center

A local board for every Claude Code session running in the Claude desktop app on your Mac:
which ones are asking you something, which finished, which are still working — and the
controls to answer, steer and tidy them up without hunting through windows.

It runs on your Mac only. It reads the files Claude Code already writes, talks to your
sessions through a small Claude Code mod, and keeps its own state in a folder of its own.

![The board: sessions in columns by state, with the questions and approvals they wait on](docs/images/board.png)

## What it does

- **Three views of your sessions.** **Inbox** (`1`): a list grouped by state. **Board** (`2`):
  the same sessions in columns — Asking you, To review, Working, Pending, Later, Done — with
  drag and drop, and lanes per repo (`G`). **Canvas** (`3`): cards you place anywhere,
  with named zones (fold one into a folder that says what its sessions wait for; drop a card
  on it to add it), sticky notes (also attached to cards, with checklists), zoom,
  multi-select and a Done strip at the bottom (what does not fit waits behind "+N more").
- **Files** Claude shows you, as in Claude desktop's side panel: a file it sends is a chip in the
  conversation, a path it names is a link, and the **Files** tab lists what the session sent,
  published or wrote, with a viewer (markdown rendered, code, images, PDFs, HTML in a sandbox,
  Word documents as a page, Excel sheets and CSV as tables, anything else Quick Look knows as a
  picture), "Show in Finder" and "Open on the Mac". Only files the session's own transcript names are served. Published
  artifacts link to claude.ai.
- **Code blocks** in a conversation wrap their lines and have a Copy button; with **Run
  commands** on (Setup), a shell block also has Run: it runs on your Mac in the session's
  folder, with its output and a Stop button under the block, as in Claude desktop.
- **Next up** (`F`, or the button with the count): opens what waits for you next, its reply box
  ready: approvals, then questions (the longest waiting first), then what is new to review.
- **Read and reply from the board.** Open a card to read the conversation and reply as if you
  typed it in Claude. It follows the session as it happens (no polling), and Claude's answer
  shows as it is written, as in Claude desktop (bridge mod 0.8.0). Messages wait 5 s (and while a turn runs) so you can undo them. Attach
  images, PDFs and any other file; dictate with Whisper on your Mac.
- **Answer what sessions ask.** Questions with options (AskUserQuestion) and tool approvals
  ("Allow Bash: …") can be answered on the card or in the conversation; the dialog in Claude
  closes by itself. Reply buttons Claude offers at the end of a turn are one click.
- **Sleeping sessions wake up.** Claude desktop stops idle sessions to save memory. Sending to
  one wakes it in the background and delivers the message; the app you were using keeps the
  focus. Claude desktop runs at most as many sessions as the Mac's memory allows (6 on 16 GB) and
  does not start one in the background past that: the board then runs the turn itself, headless,
  in the same session (marked "headless"; open it in Claude when it ends to see it there).
- **Stop, mode, model.** Stop a running turn (`S`), switch the permission mode and the model of
  a session from the reply box. In a session running in Auto the mode change goes as your
  message (Auto's classifier lets only the conversation change it); to a mode that asks less,
  Claude desktop asks you to approve it.
- **Changes and PRs.** Each session's diff against its base branch, with line comments sent
  back as one message, or side by side in VS Code's diff view, with the tree of changed files
  beside them; it follows the disk, so edits made by hand show too; its pull requests with checks, review state, unresolved comments and a
  "Ready to merge?" checklist; merge from the panel (needs `gh`).
- **Code**: the session's repository as in VS Code, with its editor (Monaco). The file tree with
  each file's type icon and git's status, the open files as tabs, `⌘S` to save, `⌘P` to open a file by name
  and `⌘⇧F` to search every file. The margin marks what changed since the branch started, as
  VS Code does, and the tab remembers its open files and folders per session. If Claude
  changed a file after you opened it, saving asks first: reload it, compare, or keep yours; a file
  you did not touch follows the disk. Monaco (25 MB) is downloaded from npm the first time, checked
  against its pinned hash, and kept in the state folder.
- **Fork** a conversation from any of your messages into a new session, **run** the session's
  project (`▶` on the card) and see its ports, **start new sessions** in any folder with a first
  prompt, files, mode, model and effort, in a new git worktree if you like.
- **Suggested tasks.** When Claude suggests a task for a session of its own (the chip Claude
  desktop shows), the conversation shows it too: **Start** opens "New session" with its folder and
  prompt, in a new worktree, for you to change before it runs; **Dismiss** puts it away. Once started
  (here or in the app) the card says so and links to the session.
- **Catch me up** (`D`): one line per session about what happened since you last looked and what
  is yours to do, written by Claude in a separate call that does not touch your sessions.
- **Plan limits** in the sidebar: how much of your 5-hour and weekly windows is used, when each
  resets, whether you are ahead of the time gone by, where you get at this pace ("full at
  14:20"), and which sessions used most of the last 5 hours.
- **Memory** per session: what its process and everything it started take on your Mac, dev
  servers left running after their turn (or after the session went to sleep) included. A card
  shows it from 1 GB (red from 3 GB), the conversation lists each process with Stop, and the
  sidebar sums your sessions, warns when the Mac runs short of memory, and finds the commands
  left running for hours that nobody uses, to stop them all with one click.
- **Colours**: give a card a colour of yours (lilac, blue, teal, green, yellow, orange, pink) from
  its palette button or `C`; it wears it on the inbox, the board and the canvas.
- **Tiers**: a fourth view, a tier list of your sessions by importance (Main task, Fixes, Searches,
  Other), top to bottom, filling the whole height. Drag a card to a row, or move the selected one with
  `[` and `]`; Paused puts it in Later. A row lays its cards left to right, with a scrollbar when they
  do not fit, in the order you give them: drag a card to its place, or move it with `<` and `>`.
  Activity never reorders them. Done cards are on no row: close them from the card.
- **General context**: the sidebar's button shows what Claude reads when a session starts:
  `~/.claude/CLAUDE.md` and each project's memory (`~/.claude/projects/<folder>/memory/`), to read
  and edit. A save keeps the version before it (`.before-edit`) and refuses to overwrite a file
  changed elsewhere since you opened it.
- **Files changed**: at the end of a turn that edited files, the conversation shows them with their
  lines added and removed, as Claude desktop does; a click opens the change in Changes.
- **File icons**: files and folders wear VS Code's Material Icon Theme (MIT), loaded on first use.
- **Code colours**: Setup → "Code colours" colours code everywhere it shows (Code, Files, Changes,
  the conversation) with Shiki, or turns it off. Pick a theme from the carousel; your own Cursor or
  VS Code theme is read from that editor on this Mac and is the default.
- **Still cards**: Setup → "Shake waiting cards" turns off the shake of the cards that wait for you.
- **Overlaps**: a card warns when another open session edited the same files in the last hours,
  or works in the same folder right now.
- **Context and cost** per session, background work running now, the task list of the current
  turn, unread marks, urgency colours, macOS notifications and a Dock badge when a session asks, a bell
  on a card to hear once when that session finishes, and
  an optional chime when a session finishes or asks (heard while you look at the board too).
- **Read aloud** (optional): when a session ends its turn, the Mac says what it did, with `say`:
  the recap it wrote for Claude desktop's "next step" box, and its question if it asks one. For
  every session or only the ones with the bell; the voice and speed are yours to pick, and the
  waves in the sidebar turn it on and off (and stop what it is saying). By default it uses the
  Mac's system voice, which can be Siri's (System Settings → Accessibility → Read & Speak).
- **Search** every conversation you ever had (`/` or `⌘K`), archived ones included, in a palette
  as in Claude desktop: tabs, the words marked in the title and a quote, the keyboard to choose.
- **Tasks** (optional): a markdown task list per project that Claude keeps for you, shown on each
  session.

| | |
|---|---|
| ![Inbox: sessions grouped by state](docs/images/inbox.png) | ![Canvas: cards in zones, with sticky notes](docs/images/canvas.png) |
| **Inbox** — what needs you first | **Canvas** — your own layout, zones and notes |
| ![A conversation open beside the board, with a question to answer](docs/images/conversation.png) | ![Setup: each step says what it changes](docs/images/setup.png) |
| **Conversation** — read, reply and answer | **Setup** — each step runs only when you press it |

## Requirements

- macOS and the [Claude desktop app](https://claude.ai/download), with its Code tab used at least
  once: the app then ships the Claude Code CLI the board uses (a `claude` on your PATH works too).
- [Bun](https://bun.sh) (the installer offers to install it).
- Python 3.8+ (`xcode-select --install` provides it): the session hook is a Python script.
- Optional: [Homebrew](https://brew.sh) for dictation; the [GitHub CLI](https://cli.github.com)
  (`gh`, signed in) for pull requests.

## Install

```bash
git clone https://github.com/caaarlxs/agent-center.git
cd agent-center
./install.sh
```

The installer builds the board's page (it downloads its packages the first time, a minute or
two), starts the server as a launchd agent (`local.agent-center`, it starts with your
Mac and restarts if it stops) and opens <http://localhost:7777>. Install it as an app from
Chrome's address bar if you like (a PWA: its own window, notifications, Dock badge).

The **Setup** dialog opens by itself the first time (later: the gear in the sidebar). Each step
says what it changes and runs only when you press it:

| Step | What it does | |
|---|---|---|
| Claude desktop | Checks that the app is installed. | required |
| Session tracking | Copies `hooks/session-inbox.py` to `~/.claude/hooks` and adds it to `~/.claude/settings.json` (backed up first to `settings.json.before-agent-center`). | required |
| Bridge mod | Installs the `agent-center-bridge` Claude Code mod from this folder. It delivers your messages, answers questions and approvals, stops turns and reports your plan limits. Sessions load it when they start. | required |
| Read sent files | Lets Claude read, without asking, the files you send from the board (`~/.claude/agent-center/uploads` only). | recommended |
| Dictation on this Mac | `brew install whisper-cpp ffmpeg` and downloads the Whisper model (~550 MB). Your voice never leaves the Mac. Pick the language or let Whisper detect it; you can change it later. Without it the microphone uses the browser's dictation where there is one. | optional |
| Tasks | Installs `organizer.py` in `~/organizer`, adds a short note to `~/.claude/CLAUDE.md` (shown before) asking Claude to keep your task list, and lets Claude run `organizer.py` without asking. Tasks live in a `TASKS.md` at the root of each project you register, plus `~/organizer/inbox.md`. Without it there is no Tasks tab. | optional |
| Run commands | Adds Run to the shell blocks of a conversation: a click runs that command on this Mac, in the session's folder, with your shell. Off until you turn it on; Turn off removes it. | optional |
| GitHub PRs | Checks that `gh` is installed and signed in, and tells you the command when it is not. | optional |
| Notifications | macOS notifications when a session asks while you are in another window. | optional |
| Sound | A short chime when a session finishes its turn or asks you something, also while you look at the board. The speaker in the sidebar turns it on and off. | optional |
| Read aloud | The Mac says what a session did when its turn ends (its recap), for every session or only the ones with the bell, in the voice and speed you pick. | optional |
| Diagnostics | Messages or answers that do not reach a session: "Copy report" copies this Mac's setup and each session's bridge mod (no conversation in it) to send to whoever helps. | tool |

Sessions that were already open load the mod the next time they start.

### Update

```bash
git pull
```

The board then shows "A newer version of Agent Center is on disk" with an **Update** button. It
brings up to date what still runs older code (the hook, the bridge mod, the server), builds the
page again when its sources changed, restarts the server and reloads the page. Your board (cards,
zones, notes, names) lives in your data folder, not in the repository: a pull never touches it. Sessions already open load a newer mod when they restart.

### Uninstall

```bash
./uninstall.sh
```

It stops the server, removes the hook entries, the rule for sent files and the bridge mod, and
asks before deleting the board's data and the files you sent. The tasks (`~/organizer`), their
note in `CLAUDE.md` and their permission rule stay; delete them yourself if you want.

## How it works

```
Claude desktop ──runs──▶ Claude Code sessions ──hook──▶ ~/.claude/session-inbox/<id>.json
                              ▲    │                                │
                bridge mod ───┘    └──transcripts──▶ ~/.claude/projects/**.jsonl
                     │                                              │
     ~/.claude/agent-center (outbox, answers, heartbeat…)           │
                     │                                              ▼
                     └────────────────▶  server (Bun, localhost) ◀── reads
                                              │
                                     the board in your browser
```

- **The hook** (`hooks/session-inbox.py`) records, per session, whether it works, asks or
  finished, what it asks, and the recap of its last turn.
- **The bridge mod** (`bridge/`) runs inside every session. It reads the messages the board
  leaves in `~/.claude/agent-center/outbox/<session>/` and submits them as your prompt when the
  session is free; it writes a heartbeat (`alive/`), acknowledges deliveries (`acks/`), holds
  questions and approvals for the board (`questions/`, `permissions/`) and takes the board's
  answers (`answers/`, `permits/`), stops turns (`control/`) and applies mode and model changes
  (`settings/`). Each file has a single writer.
- **The server** (`server.ts`, `routes/`, `lib/`) combines the hook records, the desktop app's own
  session records (titles, archived, starred), the transcripts and the mod's files into one
  snapshot, pushed to the page over server-sent events. Your own decisions (pins, columns,
  canvas places, zones, notes, names) live in its `data/board.json`.
- **The page** (`web/`) is a React app (TypeScript, Vite, Tailwind, shadcn/ui, React Flow),
  built into `web/dist` and served by the server. It imports the server's types from `lib/`, so a
  change on one side that breaks the other fails to compile.

Waking a sleeping session uses the desktop app's own link (`claude://code/continue`), retried
every 20 s up to 4 times. If the app no longer trusts the session's folder, it refuses to start
it; the board reads that from the app's log and tells you to open it in Claude.

## Your data

Everything stays on your Mac. The server listens on `127.0.0.1` only, refuses requests from other
sites and other host names, and needs its own header for anything that changes state.
With Run commands on, a click on Run runs that block's command on your Mac: it runs exactly what
the block says, as Claude desktop's own Run does.

| Where | What |
|---|---|
| `~/Library/Application Support/Agent Center/` | the board's state (`data/`), its log (`logs/`), the Whisper model (`models/`), the code editor (`vendor/`), your choices (`settings.json`) |
| `~/.claude/session-inbox/` | one file per session, written by the hook |
| `~/.claude/agent-center/` | messages, answers and heartbeats shared with the mod; the files you sent (`uploads/`) |

Nothing deletes the files you send; the sidebar shows how much they take and opens the folder.
Catch me up and new sessions run Claude Code itself (`claude -p`), with your account.

New sessions start in Auto. Claude desktop gives a session it imports its own default mode, so
for them to stay in Auto once they move into the app, set it in `~/.claude/settings.json`:
`"permissions": { "defaultMode": "auto" }` (sessions you start in the app then start in Auto too).

## Configuration

| Setting | Where | Default |
|---|---|---|
| Port | `AGENT_CENTER_PORT=7788 ./install.sh` (written into the launchd agent) | `7777` |
| Dictation language | Setup → Dictation on this Mac (applies at once), or `AGENT_CENTER_VOICE_LANG` | `auto` |
| Tasks on or off | Setup → Tasks | on when installed |
| State folder | `AGENT_CENTER_HOME` | `~/Library/Application Support/Agent Center` |

## Keyboard

| Keys | Action |
|---|---|
| `J` `K` / `↓` `↑` | Move between sessions |
| `↵` | Open the conversation |
| `⌘[` `⌘]`, the mouse's side buttons | The conversation opened before, after |
| `R` | Reply |
| `T` | Rename (on the board only) |
| `O` | Open in Claude |
| `P` | Pin |
| `4` | Tiers view |
| `[`, `]` | On Tiers: the selected card one row up, down |
| `<`, `>` | On Tiers: the selected card one place left, right in its row |
| `C`, then `1`–`7` | Colour the card (`0` takes it off) |
| `A`, then `1`–`5` | Later (pick when); on a card already in Later, back |
| `E` | Mark as done; on a done card, reopen |
| `U` | Mark to review (a Pending card) |
| `S` | Stop the running turn (a Working card) |
| `F` | Next up: what waits for you |
| `Z` | Undo |
| `/`, `⌘K` | Search |
| `1` `2` `3` | Inbox · Board · Canvas |
| `G` | Lanes per repo (Board) |
| `N` | New session |
| `D` | Catch me up |
| `+` `−` `0`, `Space` + drag | Canvas: zoom in, out, fit; move the view |
| `?` | All shortcuts |
| `Esc` | Close |

## Development

```bash
bun install          # TypeScript and Bun's types, for the server's checks
bun run check        # type-check the server, strict
bun test             # end-to-end: starts a server on a free port with a temporary home
cd web && bun install
bun run dev          # the page on http://localhost:7795, live, against the board on 7777
bun run check && bun run test && bun run lint   # the page: types, unit tests, lint
bun run build        # into web/dist, which the server serves
launchctl kickstart -k gui/$(id -u)/local.agent-center    # restart after editing the server
tail -f ~/Library/Application\ Support/Agent\ Center/logs/server.log
```

`bun run demo` starts a board with made-up sessions and repos in a temporary folder, on
<http://localhost:7799> (`bun run demo -- --port N` for another port). It does not touch your
sessions; the screenshots above come from it.

The tests use `AGENT_CENTER_DATA` (another data folder) and `AGENT_CENTER_DRY_RUN` (no
`claude://` link is opened); both work for a manual test server too.

`/design` shows every component the page uses, with made-up data. The bridge mod
is checked with `claude plugin validate bridge`; after changing it, bump its version in
`bridge/.claude-plugin/plugin.json` and press Update in Setup.

## Limits

- macOS and the Claude desktop app only. The board reads the app's session records and log and
  uses its `claude://` links; none of these are a documented interface and a new version of the
  app may change them.
- The mod uses Claude Code's plugin hooks API, which is in early access.
- Waking a session switches the session the Claude window shows.
- The plan limits come from sessions running the mod; with none open they get older (shown dimmed).

## License

MIT — see [LICENSE](LICENSE). The page's packages (`web/package.json`) keep their own licences;
the Code tab's editor, [Monaco](https://github.com/microsoft/monaco-editor) (MIT, © Microsoft), is
downloaded from npm on first use (lib/monaco.ts).
The menus, tooltips, dialogs, hover cards, tabs and select animate with
[Animate UI](https://animate-ui.com) (`@animate-ui/react`, MIT + Commons Clause: used here as a
dependency inside the app; its components are not redistributed on their own). Some icons and
motions come from [Lucide Animated](https://lucide-animated.com) and [Icona](https://icona.works),
and some components are adapted from [Watermelon UI](https://ui.watermelon.sh), all MIT.
