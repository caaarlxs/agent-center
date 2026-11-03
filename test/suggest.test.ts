import { describe, expect, it } from "bun:test"
import { answerOf, exchangesOf } from "../lib/suggest"

const you = (text: string, uuid: string) => ({ type: "user", uuid, message: { content: text } })
const claude = (content: any[], uuid: string) => ({ type: "assistant", uuid, message: { content } })
const result = (uuid: string) => ({ type: "user", uuid, message: { content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } })

describe("exchangesOf", () => {
  it("takes your message and Claude's last words of each turn, keyed by the last row", () => {
    const rows = [
      you("haz el test", "1"), claude([{ type: "text", text: "Lo hago." }, { type: "tool_use", id: "t", name: "Bash", input: {} }], "2"), result("3"),
      claude([{ type: "text", text: "Hecho. ¿Lo subo?" }], "4"),
      you("<system-reminder>x</system-reminder>", "5"),
    ]
    const { key, exchanges } = exchangesOf(rows)!
    expect(key).toBe("5")
    expect(exchanges).toEqual([{ you: "haz el test", claude: "Hecho. ¿Lo subo?" }])
  })
  it("keeps the last three turns", () => {
    const rows = [1, 2, 3, 4].flatMap(n => [you(`m${n}`, `u${n}`), claude([{ type: "text", text: `a${n}` }], `a${n}`)])
    expect(exchangesOf(rows)!.exchanges.map(e => e.you)).toEqual(["m2", "m3", "m4"])
  })
  it("has nothing without a turn", () => expect(exchangesOf([])).toBeNull())
})

describe("answerOf", () => {
  it("takes the message alone", () => {
    expect(answerOf("Sí, súbelo")).toBe("Sí, súbelo")
    expect(answerOf(" “Haz el paso 2” \n")).toBe("Haz el paso 2")
  })
  it("has none when Claude sees none", () => {
    expect(answerOf("NONE")).toBeNull()
    expect(answerOf("")).toBeNull()
    expect(answerOf("x".repeat(700))).toBeNull()
  })
})
