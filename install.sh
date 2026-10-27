#!/bin/bash
# Agent Center installer. It only starts the server (a launchd agent that
# keeps it running) and opens the board; the setup dialog there asks before
# each change to Claude Code (hook, bridge mod, dictation, tasks).
#
#   ./install.sh            install, or update after a git pull
#   AGENT_CENTER_PORT=7788 ./install.sh   another port (default 7777)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$HOME/Library/Application Support/Agent Center"
LABEL="local.agent-center"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${AGENT_CENTER_PORT:-7777}"

say() { printf '%s\n' "$*"; }
ask() { read -r -p "$1 [y/N] " answer; [[ "$answer" =~ ^[yY] ]]; }

# ---------- what it needs ----------

[[ "$(uname)" == "Darwin" ]] || { say "Agent Center runs on macOS only."; exit 1; }
[[ -d "/Applications/Claude.app" ]] || say "Note: Claude desktop is not in /Applications. Get it at https://claude.ai/download; the board shows its sessions."
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
  say "Python 3.8 or newer is needed (the session hook is a Python script). Run: xcode-select --install"
  exit 1
fi

BUN="$(command -v bun || true)"
[[ -z "$BUN" && -x "$HOME/.bun/bin/bun" ]] && BUN="$HOME/.bun/bin/bun"
if [[ -z "$BUN" ]]; then
  say "Agent Center runs on Bun (https://bun.sh), which is not installed."
  if ask "Install Bun now with its official installer (curl -fsSL https://bun.sh/install | bash)?"; then
    curl -fsSL https://bun.sh/install | bash
    BUN="$HOME/.bun/bin/bun"
  else
    say "Install Bun and run ./install.sh again."
    exit 1
  fi
fi

# ---------- the page ----------

# The board's page is a web app (web/): its packages, then its build. The
# first time it downloads them (a minute or two); after a pull, only what changed.
say "Building the board's page…"
(cd "$APP_DIR/web" && "$BUN" install --frozen-lockfile && "$BUN" x --bun vite build) >/dev/null || {
  say "Could not build the page. Run it by hand to see why: cd \"$APP_DIR/web\" && bun install && bun run build"
  exit 1
}

# ---------- the port ----------

# Taken by another program (not an Agent Center already running there): stop
# before touching anything.
if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 &&
  ! curl -s "http://localhost:$PORT/api/setup" | grep -q '"steps"'; then
  say "Port $PORT is used by another program. Free it, or choose another: AGENT_CENTER_PORT=7788 ./install.sh"
  exit 1
fi

# ---------- stop what runs now ----------

# This agent, and any other that runs this same server (an earlier install
# under another name, whose file is kept aside): stopped before its state moves.
# Waits until launchd has let go of a label (bootout returns before that).
unloaded() {
  for _ in $(seq 1 50); do
    launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1 || return 0
    sleep 0.1
  done
}

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
unloaded "$LABEL"
mkdir -p "$STATE/data" "$STATE/logs" "$STATE/models"
for other in "$HOME"/Library/LaunchAgents/*.plist; do
  [[ -f "$other" && "$other" != "$PLIST" ]] || continue
  if grep -qF "$APP_DIR/server.ts" "$other"; then
    label="$(/usr/libexec/PlistBuddy -c 'Print :Label' "$other" 2>/dev/null || true)"
    [[ -n "$label" ]] && { launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true; unloaded "$label"; }
    mv "$other" "$STATE/$(basename "$other").old"
    say "Stopped the earlier agent ${label:-$other} (its file is in $STATE)."
  fi
done

# ---------- its own folder ----------

# An earlier version kept its state inside the code folder: moved out once.
for dir in data logs models; do
  if [[ -d "$APP_DIR/$dir" ]]; then
    find "$APP_DIR/$dir" -mindepth 1 -maxdepth 1 -exec mv -n {} "$STATE/$dir/" \;
    rmdir "$APP_DIR/$dir" 2>/dev/null || say "Left in $APP_DIR/$dir: files with the same name already in $STATE/$dir."
  fi
done

# ---------- the launchd agent ----------

mkdir -p "$HOME/Library/LaunchAgents"
python3 - "$PLIST" "$LABEL" "$BUN" "$APP_DIR" "$STATE" "$PORT" <<'PY'
import plistlib, sys, os
path, label, bun, app, state, port = sys.argv[1:]
log = os.path.join(state, "logs", "server.log")
with open(path, "wb") as f:
    plistlib.dump({
        "Label": label,
        "ProgramArguments": [bun, "run", os.path.join(app, "server.ts")],
        "WorkingDirectory": app,
        "EnvironmentVariables": {
            # Homebrew's folders: the server finds gh, whisper-cli and ffmpeg there.
            # ~/.local/bin: where Claude Code's own installer puts `claude`.
            "PATH": f"{os.path.dirname(bun)}:{os.environ['HOME']}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": os.environ["HOME"],
            "AGENT_CENTER_PORT": port,
        },
        "RunAtLoad": True,
        "KeepAlive": True,
        "StandardOutPath": log,
        "StandardErrorPath": log,
    }, f)
PY

if ! launchctl bootstrap "gui/$(id -u)" "$PLIST"; then
  say "launchd did not take the agent ($PLIST). Try ./install.sh again in a few seconds."
  exit 1
fi

# The answer must be this server's own (its setup status), not any program's.
URL="http://localhost:$PORT"
for _ in $(seq 1 50); do
  curl -s "$URL/api/setup" | grep -q '"steps"' && break
  sleep 0.2
done
if ! curl -s "$URL/api/setup" | grep -q '"steps"'; then
  say "The server did not answer at $URL. Its log: $STATE/logs/server.log"
  exit 1
fi

say "Agent Center is running at $URL"
say "The setup dialog there installs the rest, step by step."
open "$URL"
