// An agent that looks at a release step waiting for a yes, and says go on or
// hold, and why. It reads what the step shows (a simulation's report, a dry
// run's log, what a tag takes to prod) against the ticket. Today it only
// advises you; where the team lets it (DeployConfig.gates), its go is the yes,
// so that a release runs on its own and stops only where it holds.
//
// It judges what a step is about to do from what it shows; what only a person
// can do (tell QA, publish to a store) and a deploy nobody saw stay a person's.

import { join } from "node:path"
import type { Env } from "./pipeline"
import type { ReleaseStep } from "./release"

export type Advice = { verdict: "running" | "go" | "hold"; reason: string | null; pid?: number | null }

const JUDGED: ReleaseStep["kind"][] = ["simulate", "execute", "tag", "promote"]
export const canJudge = (step: ReleaseStep) => step.status === "waiting" && JUDGED.includes(step.kind) && step.phase !== "deploy"

// What the agent reads: the step, what the board found of it, its report and
// log, what goes with it, and the ticket's refinement and plan.
export function gatePrompt(key: string, dir: string, env: Env, step: ReleaseStep, answer: string) {
  const report = step.report ? join(dir, "scripts", step.report) : null
  const log = report?.replace(/\.csv$/, ".log")
  return `Eres el revisor de un paso del despliegue de ${key} a ${env}. Decides si es seguro seguir.

El paso: ${step.title} (${step.kind}).
${step.detail ? `Lo que ha visto el board: ${step.detail}\n` : ""}${step.items.length ? `Lo que va con él:\n${step.items.map(i => `- ${i}`).join("\n")}\n` : ""}${step.value && step.kind === "tag" ? `El tag: ${step.value}\n` : ""}
Lee:
${report ? `- El informe: ${report} (si existe) y el log: ${log}\n` : ""}- Lo que pide el ticket: ${join(dir, "refine.md")} y el plan: ${join(dir, "plan.md")}

Di "hold" si algo no cuadra con el ticket: registros de más o de menos, errores, filas que tocan lo que el ticket no pide, cambios en prod que no son del ticket, o si no tienes con qué juzgarlo. Di "go" solo si lo que ves es exactamente lo que el ticket pide.

Solo lees: no cambias nada, no ejecutas nada que escriba. Escribe ${answer}: {"verdict": "go" | "hold", "reason": "<una frase para una persona>"}.`
}

export function parseAdvice(text: string): Advice {
  try {
    const data = JSON.parse(text)
    if (data?.verdict === "go" || data?.verdict === "hold") return { verdict: data.verdict, reason: typeof data.reason === "string" ? data.reason.trim() : null }
  } catch {}
  return { verdict: "hold", reason: "The agent gave no clear answer" }
}
