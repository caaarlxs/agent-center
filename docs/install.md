# Install and update

## Requirements

| What | Why | |
|---|---|---|
| macOS | The board uses launchd, `say`, Quick Look and the Claude desktop app. | required |
| [Claude desktop](https://claude.ai/download), its Code tab used at least once | The app runs the sessions and ships the Claude Code CLI the board uses. A `claude` on your `PATH` works too. | required |
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
| Run commands | Adds **Run** to the shell blocks of a conversation. A click runs that command on your Mac, in the session's folder, with your shell. **Turn off** removes it. | optional |
| GitHub PRs | Checks that `gh` is installed and signed in, and tells you the command when it is not. | optional |

Sessions that were open before you installed the bridge mod load it the next time they start.

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
