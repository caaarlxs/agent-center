# Install and update

## Requirements

| What | Why | |
|---|---|---|
| macOS | The board uses launchd, `say`, Quick Look and the Claude desktop app. | required |
| [Claude desktop](https://claude.ai/download), its Code tab used at least once | The app runs the sessions and ships the Claude Code CLI the board uses. A `claude` on your `PATH` works too. | required, unless you work [without Claude desktop](#without-claude-desktop) |
| [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/setup) and [tmux](https://github.com/tmux/tmux) | Only [without Claude desktop](#without-claude-desktop). Setup installs tmux with Homebrew. | optional |
| [Bun](https://bun.sh) | Runs the server and builds the page. The installer offers to install it. | required |
| Python 3.8 or later | The session hook is a Python script. `xcode-select --install` provides it. | required |
| [GitHub CLI](https://cli.github.com) (`gh`), signed in | Pull requests, checks, merges and the release steps of the Pipeline. | optional |
| [Homebrew](https://brew.sh) | Installs Whisper and ffmpeg for dictation. | optional |

## Install

```bash
git clone https://github.com/caaarlxs/agent-center.git
cd agent-center
./install.sh
```

The installer does three things:

1. It builds the page into `web/dist`. The first time, it downloads the page's packages (one or
   two minutes).
2. It starts the server as a launchd agent, `local.agent-center`. The agent starts with your Mac
   and restarts the server if it stops.
3. It opens <http://localhost:7777>.

The installer changes nothing in Claude Code. The **Setup** dialog does that, one step at a time.

To use another port, run `AGENT_CENTER_PORT=7788 ./install.sh`. The installer writes the port
into the launchd agent.

You can install the board as an app from Chrome's address bar. It then gets its own window,
notifications and a Dock badge.

## Setup

The Setup dialog opens by itself the first time. Later, open it with the gear in the sidebar. Each
step says what it changes and runs only when you press it.

### This Mac

| Step | What it does | |
|---|---|---|
| Claude desktop | Checks that the app is installed. | required |
| Session tracking | Copies `hooks/session-inbox.py` to `~/.claude/hooks` and adds it to `~/.claude/settings.json`. It first backs the file up to `settings.json.before-agent-center`. | required |
| Bridge mod | Installs the `agent-center-bridge` Claude Code plugin from this folder. It delivers your messages, answers questions and approvals, stops turns and reports your plan limits. | required |
| Read sent files | Lets Claude read, without asking, the files you send from the board. The rule covers `~/.claude/agent-center/uploads` only. | recommended |
| Dictation on this Mac | Runs `brew install whisper-cpp ffmpeg` and downloads the Whisper model (about 550 MB). Your voice never leaves the Mac. Without it, the microphone uses the browser's dictation where there is one. | optional |
| Tasks | Installs `organizer.py` in `~/organizer`, adds a short note to `~/.claude/CLAUDE.md` (shown before it is written) that asks Claude to keep your task list, and lets Claude run `organizer.py` without asking. Without it there is no Tasks tab. | optional |
| Without Claude desktop | Runs sessions in Claude Code's CLI instead of the app. See [below](#without-claude-desktop). Installs tmux with Homebrew if it is missing. **Turn off** goes back to Claude desktop. | optional |
| Run commands | Adds **Run** to the shell blocks of a conversation. A click runs that command on your Mac, in the session's folder, with your shell. **Turn off** removes it. | optional |
| GitHub PRs | Checks that `gh` is installed and signed in, and tells you the command when it is not. | optional |

Sessions that were open before you installed the bridge mod load it the next time they start.

### Without Claude desktop

With this step on, the board never opens Claude desktop; it does not even need it installed.

- **A message to a sleeping session** starts `claude --resume <id>` in the session's folder, in
  a tmux session of the board's own (`tmux -L agent-center`, so your own tmux is not touched),
  detached. The bridge mod loads in it and delivers the message, as in Claude desktop. Questions,
  approvals, Stop and the live answer work the same.
- **Open** (`O`) shows the session in a Terminal window attached to that tmux session: one process,
  so what you type there and what you send from the board reach the same conversation. With iTerm
  installed, the step lets you choose it instead of Terminal.
- **New session**: Send runs the first turn headless, as before, and the session sleeps until a
  message wakes it. Without a prompt, it opens in a Terminal window.
- **Remote Control**: the phone button in a session's head turns on Claude Code's Remote Control
  (`/remote-control`), so the session can also be used from the Claude app on your phone or at
  claude.ai/code. A sleeping session starts with `--remote-control`; a running one gets the command
  typed in. On, the button offers the session's link and **Turn off**. Turned on or off in the
  session's own window, the board does not see it: use the button.
- **Rename**: a new name on the board is the session's own name too, as `/rename` sets it (the
  Claude app, claude.ai/code and `claude --resume` show it): typed into a session running in the
  board's tmux between turns, or written to the transcript of one that is not running. A session
  that is working, or open in Claude desktop or a terminal of yours, keeps its name, and the board
  says so. One line, up to 200 characters; Remote Control started from the board uses the name too.
- **Idle sessions end**: one nobody used for 30 minutes (no turn running, nothing waiting, no
  window attached, no Remote Control) ends; its transcript stays and the next message starts it again. At most 6 run
  at once: past that the oldest idle one ends, or the turn runs headless.
- **A folder Claude Code never trusted** would hold the session on its trust question, so the
  board runs the turn headless instead (`claude -p --resume`). Open the session once and answer
  the question; from then on it wakes in tmux.

The board uses the `claude` your terminal runs (`~/.local/bin`, Homebrew), not the one Claude
desktop ships.

### Alerts, Look and Jira

- **Alerts**: macOS notifications, a chime when a session finishes or asks, and Read aloud (the
  Mac says what a session did when its turn ends).
- **Look**: the board's style, the app icon, code colours (your own Cursor or VS Code theme is
  found and used by default) and other preferences.
- **Jira**: your Jira Cloud site, your email, an API token and the project keys. The token is
  kept in the macOS keychain, never in a file. Jira is needed for the Tickets view and the
  [Pipeline](pipeline.md).

### Help

**Diagnostics** checks why a message or an answer would not reach a session. **Copy report**
copies this Mac's setup and each session's bridge mod version, without any conversation, so you
can send it to whoever helps you. See [Troubleshooting](troubleshooting.md).

## Update

```bash
git pull
```

The board then shows "A newer version of Agent Center is on disk" with an **Update** button.
Update brings up to date what still runs older code (the hook, the bridge mod, the server),
builds the page again when its sources changed, restarts the server and reloads the page.

Your board (cards, zones, notes, names) lives in your state folder, not in the repository. A pull
never touches it. Open sessions load a newer bridge mod when they restart.

## Uninstall

```bash
./uninstall.sh
```

The uninstaller stops the server and removes the launchd agent, the hook entries, the rule for
sent files and the bridge mod. It asks before it deletes the board's data and the files you sent.

The tasks (`~/organizer`), their note in `CLAUDE.md` and their permission rule stay. Delete them
yourself if you want.
