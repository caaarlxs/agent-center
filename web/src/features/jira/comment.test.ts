import { describe, expect, it } from "vitest"
import { lastAnswers, readAnswers, readComment } from "./comment"

describe("readComment", () => {
  it("tells the pipeline's comments, their title apart from their text", () => {
    expect(readComment("🤖 Agent Center · Refinamiento de PP-1\n\nAntes de implementar…")).toEqual({ isAgent: true, title: "Refinamiento de PP-1", text: "Antes de implementar…" })
  })
  it("leaves a person's comment as it is", () => {
    expect(readComment("Respuestas\n\nQ1 ok")).toEqual({ isAgent: false, title: null, text: "Respuestas\n\nQ1 ok" })
  })
})

describe("readAnswers", () => {
  it("reads each question and its answer from the comment the board writes", () => {
    const body = "Respuestas a las preguntas del refinamiento\n\nQ1. ¿Qué copy?\nEl ticket no lo dice.\n\n→ El del Figma.\n\nQ2. ¿Reactivar?\n→ Sí, la empresa o su asesor."
    expect(readAnswers(body)).toEqual([{ id: "Q1", question: "¿Qué copy?\nEl ticket no lo dice.", answer: "El del Figma." }, { id: "Q2", question: "¿Reactivar?", answer: "Sí, la empresa o su asesor." }])
  })
  it("leaves any other comment alone, and takes the latest one", () => {
    expect(readAnswers("Un comentario cualquiera")).toBeNull()
    const old = "Respuestas a las preguntas del pipeline\n\nQ1. ¿A?\n→ uno"
    const late = "Respuestas a las preguntas del pipeline\n\nQ1. ¿B?\n→ dos"
    expect(lastAnswers([{ body: old }, { body: "hola" }, { body: late }])![0]!.answer).toBe("dos")
  })
})
