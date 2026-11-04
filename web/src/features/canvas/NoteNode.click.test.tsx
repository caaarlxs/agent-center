// @vitest-environment happy-dom
import { expect, test, vi } from "vitest"
import { act, fireEvent, render } from "@testing-library/react"
import { ReactFlowProvider } from "@xyflow/react"
import { NoteNode } from "./NoteNode"

const note = { id: "n", x: 0, y: 0, w: 240, h: 200, color: "yellow", text: "Plan\n- [ ] one\n- [ ] two" }
const draw = (onText = vi.fn()) => {
  const props = { id: "note:n", data: { note, cardTitle: null, isNew: false, onText, onChange: vi.fn(), onRemove: vi.fn() }, selected: false, dragging: false } as any
  return { onText, ...render(<ReactFlowProvider><NoteNode {...props} /></ReactFlowProvider>) }
}

test("a click on an item's text opens the editor on that line, without ticking it", async () => {
  const { onText, getByText, container } = draw()
  fireEvent.click(getByText("one"))
  expect(onText).not.toHaveBeenCalled()
  const ta = container.querySelector("textarea")!
  expect(ta).toBeTruthy()
  await act(() => new Promise(r => setTimeout(r, 50)))
  expect(ta.selectionStart).toBe("Plan\n- [ ] one".length)
})

test("the box alone ticks it", () => {
  const { onText, container } = draw()
  fireEvent.click(container.querySelectorAll("input[type=checkbox]")[1]!)
  expect(onText).toHaveBeenCalledWith(note, "Plan\n- [ ] one\n- [x] two")
  expect(container.querySelector("textarea")).toBeNull()
})
