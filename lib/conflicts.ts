// An agent that resolves a PR's conflicts with its base before the release
// merges it: it merges the base into the PR's branch (never a rebase, never a
// force push), keeps what each side does, runs the tests and pushes to the
// PR's branch. Where a conflict asks which behaviour wins, or the tests fail
// after the merge, it pushes nothing and says why: the release stops there.

import { join } from "node:path"
import type { Env } from "./pipeline"

export type Resolved = { resolved: boolean; reason: string }
export type ConflictPr = { url: string; repo: string; head: string; base: string }

export function conflictsPrompt(key: string, env: Env, pr: ConflictPr, paths: { dir: string; clone: string; stages: string; answer: string }) {
  const tree = join(paths.dir, "conflicts", `${pr.repo}-${pr.url.split("/").pop()}`)
  return `Eres quien resuelve los conflictos de una PR antes del merge del release de ${key} a ${env}.

La PR: ${pr.url}, rama ${pr.head}, contra ${pr.base}. GitHub no la puede mergear: tiene conflictos con ${pr.base}.

1. Lee ${join(paths.stages, "environment.md")}: cómo se trabaja y se prueba en cada repo.
2. En el clon ${paths.clone}: \`git fetch origin ${pr.base} ${pr.head}\` y \`git worktree add -B ${pr.head} ${tree} origin/${pr.head}\`. Trabaja solo en ese worktree.
3. Mergea origin/${pr.base} en la rama: \`git merge origin/${pr.base}\`. Nunca rebase, nunca --force.
4. Resuelve cada conflicto manteniendo lo que hace cada lado: lo que entró en ${pr.base} y lo que pide el ticket (${join(paths.dir, "refine.md")} y ${join(paths.dir, "plan.md")}).
5. Pasa los tests del repo que tocan los ficheros que estaban en conflicto.
6. Si todo cuadra: haz el commit del merge y \`git push origin HEAD:${pr.head}\`. Nunca a ${pr.base}.
7. No hagas push si un conflicto pide decidir qué comportamiento gana, o si los tests fallan por el merge: para y dilo.
8. Al terminar, \`git -C ${paths.clone} worktree remove --force ${tree}\`.
9. Escribe ${paths.answer}: {"resolved": true | false, "reason": "<una frase para una persona: qué resolviste, o por qué no>"}.

No escribas en Jira ni en GitHub fuera de ese push. Trabajas sin una persona delante: tu resultado es el fichero.`
}

export function parseResolved(text: string): Resolved {
  try {
    const data = JSON.parse(text)
    if (typeof data?.resolved === "boolean") return { resolved: data.resolved, reason: typeof data.reason === "string" && data.reason.trim() ? data.reason.trim() : data.resolved ? "Resolved" : "No reason given" }
  } catch {}
  return { resolved: false, reason: "The agent gave no clear answer" }
}
