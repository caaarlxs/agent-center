// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { closesPanel } from "./outside"

const at = (html: string, pick: string) => {
  document.body.innerHTML = html
  return document.querySelector(pick)!
}

describe("closesPanel", () => {
  it("closes on empty space: the canvas, a view's background", () => {
    expect(closesPanel(at('<div class="react-flow__pane"><span>x</span></div>', "span"))).toBe(true)
    expect(closesPanel(at("<main><section><p>empty</p></section></main>", "p"))).toBe(true)
  })
  it("keeps it on anything with its own action, which then acts: a button, a link, a field, a card, a note", () => {
    expect(closesPanel(at('<div data-sonner-toast><button aria-label="Close">x</button></div>', "button"))).toBe(false)
    expect(closesPanel(at('<section><button><svg><path/></svg></button></section>', "path"))).toBe(false)
    expect(closesPanel(at('<a href="#x">x</a>', "a"))).toBe(false)
    expect(closesPanel(at("<input>", "input"))).toBe(false)
    expect(closesPanel(at('<article data-id="s1"><p>Custom IDE</p></article>', "p"))).toBe(false)
    expect(closesPanel(at('<div class="react-flow__node"><div>note</div></div>', "div div"))).toBe(false)
    expect(closesPanel(at('<div role="button">x</div>', "div"))).toBe(false)
  })
  it("keeps it on the panel itself, the sidebar, dialogs and menus", () => {
    expect(closesPanel(at('<div data-panel><p>chat</p></div>', "p"))).toBe(false)
    expect(closesPanel(at('<aside data-sidebar><p>x</p></aside>', "p"))).toBe(false)
    expect(closesPanel(at('<div role="dialog"><p>x</p></div>', "p"))).toBe(false)
  })
})
