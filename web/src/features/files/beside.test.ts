import { describe, expect, it } from "vitest"
import { boxParts, docWidth, toggleBox } from "./beside"

describe("docWidth", () => {
  it("uses your width, else the default, within the board's room", () => {
    expect(docWidth(null, 1200)).toBe(760)
    expect(docWidth(null, 600)).toBe(600)
    expect(docWidth(1000, 1200)).toBe(1000)
    expect(docWidth(1000, 700)).toBe(700)
    expect(docWidth(200, 1200)).toBe(360)
  })
})

describe("boxParts", () => {
  it("splits the boxes to tick out of a line of text", () => {
    expect(boxParts("[ ] Sí [x] No [X] Con cambios: ____")).toEqual([{ isTicked: false }, " Sí ", { isTicked: true }, " No ", { isTicked: true }, " Con cambios: ____"])
    expect(boxParts("no boxes [a] here")).toEqual(["no boxes [a] here"])
  })
})

describe("toggleBox", () => {
  it("ticks or clears the nth box, outside code", () => {
    const text = "1. A\n[ ] Sí  [ ] No\n`[ ]` code\n```\n[ ] fenced\n```\n- [x] task"
    expect(toggleBox(text, 1)).toBe("1. A\n[ ] Sí  [x] No\n`[ ]` code\n```\n[ ] fenced\n```\n- [x] task")
    expect(toggleBox(text, 2)).toBe("1. A\n[ ] Sí  [ ] No\n`[ ]` code\n```\n[ ] fenced\n```\n- [ ] task")
    expect(toggleBox(text, 3)).toBe(text)
  })
})
