// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { itemsFor } from "./items"

const el = (html: string, pick: string) => {
  document.body.innerHTML = html
  return document.querySelector(pick)!
}
const labels = (target: Element, selection = "") => itemsFor(target, selection).map(i => i.label)

describe("what a right-click offers, by what is under it", () => {
  it("a link: open it, copy it", () => {
    expect(labels(el('<p><a href="https://deale.es/x">deale</a></p>', "a"))).toEqual(["Open link in a new tab", "Copy link"])
  })
  it("an email: write to it, copy the address alone", () => {
    const items = itemsFor(el('<a href="mailto:ana@deale.es">Ana</a>', "a"), "")
    expect(items.map(i => i.label)).toEqual(["Write an email", "Copy email address"])
    expect(items[1]!.action).toEqual({ kind: "copy", text: "ana@deale.es" })
  })
  it("an image: see it large, copy it, copy its address", () => {
    expect(labels(el('<img src="/api/uploads/a.png">', "img"))).toEqual(["See it large", "Copy image", "Copy image address", "Open image in a new tab"])
  })
  it("text you selected: copy it, besides what is under it", () => {
    expect(labels(el("<p>hola</p>", "p"), "hola")).toEqual(["Copy"])
    expect(labels(el('<a href="https://x.dev">x</a>', "a"), "x")).toEqual(["Copy", "Open link in a new tab", "Copy link"])
  })
  it("a field: cut, copy, paste, select all", () => {
    expect(labels(el("<textarea>hola</textarea>", "textarea"), "ho")).toEqual(["Cut", "Copy", "Paste", "Select all"])
    expect(labels(el("<textarea></textarea>", "textarea"))).toEqual(["Paste"])
  })
  it("nothing to offer: no menu", () => expect(labels(el("<div>x</div>", "div"))).toEqual([]))
})
