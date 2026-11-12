# Configuration

Most choices are made in the Setup dialog (the gear in the sidebar). This page lists what you can
set outside it.

## Environment variables

Set them for the server. For the launchd agent, `AGENT_CENTER_PORT` is written at install time;
add others to `~/Library/LaunchAgents/local.agent-center.plist` and restart the agent.

| Variable | What it sets | Default |
|---|---|---|
| `AGENT_CENTER_PORT` | The port the server listens on (`127.0.0.1` only). Set it when you run `./install.sh`. | `7777` |
| `AGENT_CENTER_HOME` | The state folder. | `~/Library/Application Support/Agent Center` |
| `AGENT_CENTER_DATA` | The `data/` folder alone (the board, the Pipeline). The tests use it. | `<state>/data` |
| `AGENT_CENTER_VOICE_LANG` | The language Whisper listens for (`en`, `es`…). Overrides the Setup choice. | `auto` |
| `AGENT_CENTER_CLAUDE` | The Claude Code binary to run headless. The tests give a stand-in. | the one Claude desktop ships, else `claude` |
| `AGENT_CENTER_DRY_RUN` | Opens no `claude://` link: waking and opening sessions do nothing. For tests and manual test servers. | off |
| `AGENT_CENTER_PETS_OFFLINE` | Does not read the community pets catalogue. For tests. | off |
| `AGENT_CENTER_MEMORY_EVERY_MS` | How often the memory of each session is measured. | `20000` |
| `AGENT_CENTER_FORGOTTEN_UP_MS` | How long a command must run to count as left running. | 2 hours |
| `AGENT_CENTER_FORGOTTEN_IDLE_MS` | How long it must be idle to count as left running. | 30 minutes |

## `settings.json`

The server keeps your choices in `<state>/settings.json`. The Setup dialog writes most of them.
Two keys have no screen yet: edit the file, then restart the server.

### `responseActions`: buttons under each answer

Each button opens a URL. `{session}` and `{message}` become the session's id and the answer's
message id, so a local tool can find that answer in the transcript.

```json
{
  "responseActions": [
    { "label": "Open as view", "url": "http://127.0.0.1:7790/view?session={session}&message={message}" }
  ]
}
```

### `responseViews`: other ways to read a long answer

A local tool that draws an answer at several levels. Over each answer longer than `minChars`, the
conversation shows a switch. On a level, the tool's page shows in place of the text, sandboxed.

```json
{
  "responseViews": {
    "url": "http://127.0.0.1:7790/view?session={session}&message={message}&level={level}&theme={theme}&embed=1",
    "levels": [{ "id": "concept", "label": "High level" }, { "id": "complete", "label": "Complete" }],
    "minChars": 1500
  }
}
```

- `url` must contain `{level}`. `{theme}` becomes `light` or `dark`.
- Up to 4 levels. An id has up to 24 characters from `a-z`, `0-9`, `_` and `-`.
- The page can send its height (`{ height }`) and a reply (`{ reply }`) with `postMessage`. A reply
  goes to the session as your message.

## Pipeline

The Pipeline reads its own files from `<state>/data/pipeline/stages/`. See
[Pipeline › Set it up](pipeline.md#set-it-up).

## Restart the server

```bash
launchctl kickstart -k gui/$(id -u)/local.agent-center
```
