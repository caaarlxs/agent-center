// Which version of the board runs: the commit its folder is at, read once as
// the server starts (an update restarts it). None in a folder that is not a
// git clone (a downloaded copy).

import { APP_DIR } from "./config"

export type Version = { commit: string; date: string }

export function versionOf(dir: string): Version | null {
  const out = Bun.spawnSync(["git", "-C", dir, "log", "-1", "--format=%h%n%cI", "--abbrev=7"], { stderr: "ignore" })
  if (out.exitCode !== 0) return null
  const [commit, date] = new TextDecoder().decode(out.stdout).trim().split("\n")
  return commit && date ? { commit, date } : null
}

export const version = versionOf(APP_DIR)
