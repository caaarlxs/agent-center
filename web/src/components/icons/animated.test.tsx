// @vitest-environment happy-dom
// An animated icon draws the plain Lucide icon until it first plays: hovered
// by a mouse, its Motion twin takes over (and plays).
import { act, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Anim } from "./animated"

const hover = (el: Element) => act(() => void el.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType: "mouse" })))

describe("Anim", () => {
  it("is the plain icon until the pointer reaches its button, then the moving one", async () => {
    const { container } = render(<button type="button"><Anim.Bell size={14} /></button>)
    expect(container.querySelector("svg.lucide-bell")).not.toBeNull()
    await hover(container.querySelector("button")!)
    expect(container.querySelector("svg.lucide-bell")).toBeNull()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("ignores a touch, which has no hover", async () => {
    const { container } = render(<button type="button"><Anim.Bell /></button>)
    await act(() => void container.querySelector("button")!.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType: "touch" })))
    expect(container.querySelector("svg.lucide-bell")).not.toBeNull()
  })
})
