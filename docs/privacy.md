# Privacy and security

## What stays on your Mac

The board reads your conversations, sessions and settings on your Mac and keeps its own state
there. It sends none of it anywhere. Your voice is transcribed on your Mac with Whisper.

| Where | What | Written by |
|---|---|---|
| `~/Library/Application Support/Agent Center/` | The board's state (`data/`), its logs (`logs/`), the Whisper model (`models/`), the code editor (`vendor/`) and your choices (`settings.json`) | the server |
| `~/.claude/session-inbox/` | One file per session: its state, its question, the recap of its last turn | the hook |
| `~/.claude/agent-center/` | Messages, answers and heartbeats shared with the bridge mod; the files you sent (`uploads/`) | the server and the mod |
| `~/.claude/projects/` | The conversations | Claude Code (the board only reads them) |
| Claude desktop's own records | Titles, archived and starred sessions | Claude desktop (the board only reads them) |
| macOS keychain | Your Jira API token; the Pipeline's deploy secrets | the server (Jira); you (deploy secrets) |

Nothing deletes the files you send. The sidebar shows how much they take and opens their folder.

## What goes out

| To | When | What |
|---|---|---|
| Anthropic, with your account | Catch me up, reply suggestions, handoff notes, new sessions, headless turns, the Pipeline | The prompt of that call. These run Claude Code (`claude -p`) like any session you start. |
| Your Jira Cloud site | Tickets view and Pipeline, if you set Jira up | Reads tickets; writes comments, labels and statuses only on tickets assigned to you. |
| GitHub, through `gh` | PRs, merges and releases | What `gh` sends with your login. |
| registry.npmjs.org | The first time you open the Code tab | Downloads Monaco, checked against a pinned hash. |
| huggingface.co | When you set up dictation | Downloads the Whisper model. |
| codex-pets.net | Once a day, for the pets | Reads the public catalogue. |
| cdn.jsdelivr.net, models.dev | When the page draws some icons and logos | Public assets. |

## How the server is guarded

- It listens on `127.0.0.1` only.
- It refuses requests whose `Host` is not `localhost` or `127.0.0.1` on its port, which blocks
  DNS rebinding.
- It refuses requests from other origins and other sites.
- Anything that changes state needs the `x-agent-center: 1` header, which a page on another site
  cannot send without the server's consent.
- It serves only the files a session's own transcript names. HTML files open in a sandbox;
  files it cannot show are served as downloads.

## What can run on your Mac

- **Run commands** (off by default): a click on Run runs that shell block's command, exactly as
  written, in the session's folder, with your shell.
- **Run** on a card: the command you saved for that repository.
- **Pipeline** (optional): agents write code in worktrees; the board merges, tags and runs your
  deploy commands, each after your yes.

## Changes to Claude Code

Every change the Setup dialog makes to Claude Code is listed in [Install › Setup](install.md#setup),
runs only when you press it, and is undone by `./uninstall.sh`. Before the first change to
`~/.claude/settings.json`, Setup backs it up to `settings.json.before-agent-center`.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
