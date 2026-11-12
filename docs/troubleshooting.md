# Troubleshooting

Start with **Diagnostics**: the gear in the sidebar, then **Help**. It says why a message or an
answer would not reach a session. **Copy report** copies this Mac's setup, each session's bridge
mod version and the log's last errors. The report holds no conversation, title or message text.

## A message or an answer does not reach a session

The board writes what a session gets into files; the bridge mod reads them from inside the
session. So everything depends on the mod running in that session.

| Diagnostics says | Why | What to do |
|---|---|---|
| The session runs without the mod | It was open before you installed the mod, or Claude desktop is too old for plugins. | Restart the session in Claude desktop. Update Claude desktop if needed. |
| The session runs an older mod | It started before an update. | Restart the session. |
| Nothing, but the message waits | The session is asleep and does not wake. | See the next section. |

A message waits 5 seconds before it goes, and waits while a turn runs. Until the mod takes it,
you can take it back.

## A session does not wake

Claude desktop stops idle sessions to save memory. The board wakes one with the app's own link
(`claude://code/continue`), and retries every 20 seconds up to 4 times.

- **The app no longer trusts the session's folder.** The app refuses to start the session. The
  board reads that from the app's log and tells you to open the session in Claude.
- **The app runs as many sessions as the Mac's memory allows** (6 on 16 GB). The board then runs
  the turn itself, headless, and marks the card "headless". Open the session in Claude when the
  turn ends to see it there.
- Waking a session switches the session the Claude window shows. This is how the app's link
  works.

## The page says "The server is not responding"

macOS restarts the server by itself, and the page retries every few seconds. If it stays down:

```bash
tail -50 ~/Library/Application\ Support/Agent\ Center/logs/server.log
launchctl kickstart -k gui/$(id -u)/local.agent-center
```

## The plan limits look old

The limits come from sessions that run the bridge mod: each one reads them from its last answer
from the API. With no session open, they get older and show dimmed. They update with the next
answer.

## "A newer version of Agent Center is on disk" does not go away

Press **Update**. It restarts what still runs older code and rebuilds the page. If the page does
not build, run it yourself to see the error:

```bash
cd web && bun install && bun run build
```

## Logs

| File | What |
|---|---|
| `<state>/logs/server.log` | The server's log |
| `<state>/logs/client-errors.log` | Views of the page that failed while they drew |
| `<state>/logs/memory.jsonl` | The page's and the server's memory, every 10 minutes |
| `~/Library/Logs/Claude/main.log` | Claude desktop's own log (sessions started, stopped, refused) |

`<state>` is `~/Library/Application Support/Agent Center` unless you set `AGENT_CENTER_HOME`.

## Still stuck

Open an issue with the Diagnostics report and what you did. See [CONTRIBUTING.md](../CONTRIBUTING.md#reporting-a-bug).
