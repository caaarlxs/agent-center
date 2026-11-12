# Contributing

Thanks for helping. This page explains how to run the board from source, how to check a change,
and the conventions the code follows. [docs/architecture.md](docs/architecture.md) explains how
the parts fit together.

## Development setup

You need what [install](docs/install.md#requirements) needs: macOS, Claude desktop, Bun and
Python 3.8 or later.

```bash
git clone https://github.com/caaarlxs/agent-center.git
cd agent-center
bun install                 # the server's types and TypeScript
cd web && bun install       # the page's packages
```

### Run it

| What | Command |
|---|---|
| The page, live, against the board on 7777 | `cd web && bun run dev` (opens on <http://localhost:7795>) |
| A board with made-up sessions, on <http://localhost:7799> | `bun run demo` (`bun run demo -- --port N` for another port) |
| The installed server, after you changed `lib/`, `routes/` or `server.ts` | `launchctl kickstart -k gui/$(id -u)/local.agent-center` |
| The page the installed server serves, after you changed `web/` | `cd web && bun run build` |
| The server's log | `tail -f ~/Library/Application\ Support/Agent\ Center/logs/server.log` |

The demo runs in a temporary folder and does not touch your sessions. The README's screenshots
come from it.

### Check a change

| Part | Command |
|---|---|
| Server: types (strict) | `bun run check` |
| Server: tests | `bun test` |
| Page: types | `cd web && bun run check` |
| Page: tests | `cd web && bun run test` |
| Page: lint | `cd web && bun run lint` |
| Bridge mod | `claude plugin validate bridge` |

The server's tests start a real server on a free port with a temporary home. They use
`AGENT_CENTER_DATA` (another data folder) and `AGENT_CENTER_DRY_RUN` (no `claude://` link is
opened). Both work for a manual test server too.

## Conventions

- **Every file starts with a comment that says what it does and why.** Read it before you
  change the file; keep it true after.
- **One writer per file on disk.** `data/board.json` is written only by `lib/board.ts`; each file
  shared with the bridge mod has one writer (see the table in
  [architecture](docs/architecture.md#the-bridge-mod-bridge)). Keep it that way.
- **Pure logic apart, with its test.** Rules that decide something (what is costly, when a note
  shows, how a step deploys) live in a pure function with a test next to it. Components and
  routes stay thin.
- **Transcripts only grow.** A reader of them keeps its offset and reads only what was added.
- **The server's types are the page's types.** The page imports them from `lib/`. Change both
  sides in the same commit.
- **One change, every stage.** When a change in one place affects what comes after it (a value
  the page shows, a stage of the Pipeline), follow it through and fix each place.
- **Plain words in the interface.** Name things by what they are and say what a button does.
  Cut helper text a good layout makes unneeded.

### When you add or change a feature

1. Add or change its line in [FEATURES.md](FEATURES.md): `- {icon} **Title**: one sentence on
   what to press and what happens. · YYYY-MM-DD`. The app shows dated lines as "What's new".
   The icon must be a Lucide name listed in `web/src/features/guide/icons.ts`.
2. Update the page of `docs/` that explains it, if one does.

### When you change the bridge mod

1. Bump its version in `bridge/.claude-plugin/plugin.json`.
2. If the server asks the mod for something new, raise the mod's protocol version and make the
   server check it (`lib/diagnose.ts`).
3. Run `claude plugin validate bridge`, then press **Update** in Setup. Open sessions load the new
   mod when they restart.

## Commits and pull requests

- A commit message says what changes for the person, in one line: "Where it goes: the last hour,
  5 hours, day, week or month". The body says why, when it is not obvious.
- One concern per pull request. Fill in the template: what changes, how you checked it, and
  screenshots for anything visible.
- Never commit personal data or tokens. Use made-up names in tests and examples.

## Reporting a bug

Open an issue with:

1. What you did, what you expected and what happened.
2. The **Diagnostics** report (the gear in the sidebar, then **Help**, then **Copy report**). It
   holds no conversation text.
3. The last lines of `~/Library/Application Support/Agent Center/logs/server.log`, if the server
   is involved.

For a security problem, do not open an issue: see [SECURITY.md](SECURITY.md).
