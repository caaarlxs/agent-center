// The folders New session offers (GET /api/repos), kept: the dialog opens
// with the last list and asks again behind it (lib/cached.ts).
import { cachedGet } from "@/lib/cached"

export type Repo = { root: string; name: string }
export const knownRepos = cachedGet<{ repos: Repo[] }>("/api/repos")
