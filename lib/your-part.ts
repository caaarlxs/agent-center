// "Your part": the guide to what a person does by hand for a ticket to reach
// staging and prod (a template Meta approves, a flag, a store release), for
// someone who has not read the plan. An agent writes it once the plan is
// done, a section a step, in the order to do them; each section opens a chat
// that goes on with you until the step is done.

import { createHash } from "node:crypto"
import { join } from "node:path"
import type { Env, PipelineState } from "./pipeline"
import { releaseSteps, type DeployConfig, type Link, type StepNote } from "./release"

// A step only a person does, in staging, prod or both: the plan's (with its id and note) or a repo's way (deploy.json).
export type PartStep = { id: string | null; text: string; envs: Env[]; note: StepNote | null }
export type PartSection = { step: string | null; title: string; when: string; context: string; where: Link[]; steps: string[]; done: string; unlocks: string }
// from: the steps it was written for, to tell when the plan changed them.
export type YourPart = { from: string; at: number; intro: string; sections: PartSection[] }

const ENVS: Env[] = ["staging", "prod"]

// The steps a person does in each environment still to go, each once.
export function stepsForYou(state: PipelineState, config: DeployConfig): PartStep[] {
  const steps: PartStep[] = []
  for (const env of ENVS) {
    for (const s of releaseSteps(state, env, config).filter(s => s.kind === "manual")) {
      const same = steps.find(p => p.text === s.title)
      if (same) same.envs.push(env)
      else steps.push({ id: s.note?.id ?? null, text: s.title, envs: [env], note: s.note ?? null })
    }
  }
  return steps
}
export const stepsHash = (steps: PartStep[]) => createHash("sha256").update(steps.map(s => `${s.envs.join(",")} ${s.text}`).join("\n")).digest("hex").slice(0, 16)

const noteLine = (n: StepNote | null) => (n?.why ? ` Por qué, según el plan: ${n.why}` : "")
// reader: the person the board is of (their name in Jira), who does the steps; the plan may name them.
export const partPrompt = (tag: string, key: string, dir: string, steps: PartStep[], out: string, reader: string | null) => `${tag} ${key} · tu parte

Preparas la guía «Tu parte» del ticket ${key}: lo que una persona del equipo hace a mano para que el ticket llegue a staging y a prod. Esa persona no ha leído el plan ni el código, y la guía es todo lo que tiene.
${reader ? `La lee ${reader}, que hace estos pasos: háblale de tú. Si el plan le nombra («${reader.split(" ")[0]} hace…»), es esa misma persona: nunca le digas que pregunte, pida o avise a ${reader.split(" ")[0]}. Si algo lo decide o lo sabe otra persona, di quién; si no lo sabes, di qué falta decidir.` : "Háblale de tú. Si algo lo decide o lo sabe otra persona, di quién; si no lo sabes, di qué falta decidir."}

1. Lee en ${dir}: ticket.md, refine.md, plan.md, plan.json y work-plan/. Si hace falta, el código en ${join(dir, "work")}. Busca en la web lo que no sepas de una herramienta de fuera (Meta, AWS, las stores).
2. Los pasos de la persona, con su id:
${steps.map(s => `   - ${s.id ?? "—"} [${s.envs.join(", ")}] «${s.text}».${noteLine(s.note)}`).join("\n")}
3. Una sección por paso. Junta pasos que se hacen a la vez, o parte uno largo; cada sección dice qué paso cubre en "step" (null si no es de la lista). Ordena las secciones por cuándo hacerlas: primero lo que tarda (una aprobación de fuera) o lo que bloquea otros pasos.
4. Escribe ${out}:
{"intro": "…", "sections": [{"step": "M1", "title": "…", "when": "…", "context": "…", "where": [{"label": "…", "url": "https://…"}], "steps": ["…"], "done": "…", "unlocks": "…"}]}
   - intro: 2 o 3 frases: qué cambia el ticket y qué queda en manos de la persona.
   - title: la acción, corta y en imperativo.
   - when: cuándo hacerlo ("Ahora, antes de staging", "Tras el deploy de user-service en staging"…).
   - context: qué es y por qué el ticket lo necesita, sin jerga. Markdown.
   - where: los enlaces exactos (consola, repo, tabla, ticket). Solo URLs que existen.
   - steps: los pasos en orden, en markdown. Lo que la persona copia va entero en un bloque de código: textos, variables, JSON, comandos. Nunca "con los textos de PP-…": el texto entero.
     Déjale el trabajo lo más hecho posible:
     · Lo que se hace con una herramienta (AWS CLI, gh, git, curl, un script del repo) va como comando listo para pegar, con todos los valores: entorno, tabla, clave e item enteros. Las tablas de DynamoDB llevan el entorno en el nombre (environment.md). Si no sabes el perfil o la región de AWS, deja \`--profile <perfil del entorno>\` y dilo en el paso.
     · En orden: un comando que mira cómo está ahora (get-item, query, describe), el que lo cambia y el que comprueba que quedó bien.
     · Si existe ${join(dir, "steps")}/<id del paso>.sh, ese paso lo hace el board: al llegar a él lo simula y lo ejecuta cuando la persona lo aprueba. La sección dice qué hace el script, qué verá en la simulación y qué aprueba; los comandos sueltos solo para hacerlo a mano si el script falla.
     · Un mensaje a otra persona (marketing, el owner de un área): el texto entero del mensaje, listo para enviar, y a quién.
     · A mano, explicado, solo lo que no tiene herramienta: una aprobación de fuera, publicar en las stores.
   - done: cómo sabe que está hecho.
   - unlocks: qué desbloquea, y qué pasa si no se hace.

Español claro: frases cortas, voz activa, un término para cada cosa. Lo que no sepas, dilo en su paso. Solo lee: no cambies nada más que ${out}. Nunca ejecutes nada contra un entorno.`

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])
// The guide the agent wrote, as far as it holds: sections with a title and steps.
export function partIn(v: any, from: string, at: number): YourPart | null {
  const sections = list(v?.sections)
    .map(s => ({ step: text(s?.step) || null, title: text(s?.title), when: text(s?.when), context: text(s?.context),
      where: list(s?.where).filter(w => text(w?.label) && /^https?:\/\//.test(text(w?.url))).map(w => ({ label: text(w.label), url: text(w.url) })),
      steps: list(s?.steps).map(text).filter(Boolean), done: text(s?.done), unlocks: text(s?.unlocks) }))
    .filter(s => s.title && s.steps.length)
  return sections.length ? { from, at, intro: text(v?.intro), sections } : null
}

// The first message of a chat on one step: what it is, where the guide and the context are.
export const chatPrompt = (key: string, dir: string, section: Pick<PartSection, "step" | "title">, step: string | null) => `${key} · Tu parte: ${section.title}

Quiero hacer este paso del despliegue de ${key} y necesito ayuda${step ? `: «${step}»` : ""}.

La guía «Tu parte» está en ${join(dir, "your-part.json")}${section.step ? ` (sección del paso ${section.step})` : ""}. El contexto está en la misma carpeta: ticket.md, refine.md, plan.md y work-plan/. El código, en work/.

Léelo y explícame qué tengo que hacer, paso a paso, con todo lo que tenga que copiar. Después pregúntame qué me falta (accesos, datos) y acompáñame hasta que esté hecho. No cambies código ni repos sin preguntarme.`
