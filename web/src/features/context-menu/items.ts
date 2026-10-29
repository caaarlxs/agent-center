// What a right-click offers, by what is under it: a link (open it, copy it),
// an email (write to it, copy the address), an image (see it large, copy
// it, copy its address), a field (cut, copy, paste, select all), and the
// text you selected (copy). Nothing of these: no menu of ours.

export type Action =
  | { kind: "copy"; text: string }
  | { kind: "open"; url: string }
  | { kind: "image"; src: string }
  | { kind: "copyImage"; src: string }
  | { kind: "cut" | "paste" | "selectAll"; field: HTMLElement }
export type Item = { label: string; action: Action; hint?: string; group: number }

const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=''], [contenteditable=true]"

function fieldItems(field: HTMLElement, selection: string): Item[] {
  const isEmpty = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? !field.value : !field.textContent
  return [
    ...(selection ? [{ label: "Cut", action: { kind: "cut", field } as Action, hint: "⌘X", group: 0 }, { label: "Copy", action: { kind: "copy", text: selection } as Action, hint: "⌘C", group: 0 }] : []),
    { label: "Paste", action: { kind: "paste", field }, hint: "⌘V", group: 0 },
    ...(isEmpty ? [] : [{ label: "Select all", action: { kind: "selectAll", field } as Action, hint: "⌘A", group: 1 }]),
  ]
}

function linkItems(href: string): Item[] {
  if (href.startsWith("mailto:")) {
    const address = decodeURIComponent(href.slice(7).split("?")[0] ?? "")
    return [{ label: "Write an email", action: { kind: "open", url: href }, group: 1 }, { label: "Copy email address", action: { kind: "copy", text: address }, group: 1 }]
  }
  return [{ label: "Open link in a new tab", action: { kind: "open", url: href }, group: 1 }, { label: "Copy link", action: { kind: "copy", text: href }, group: 1 }]
}

function imageItems(src: string): Item[] {
  return [
    { label: "See it large", action: { kind: "image", src }, group: 2 },
    { label: "Copy image", action: { kind: "copyImage", src }, group: 2 },
    { label: "Copy image address", action: { kind: "copy", text: src }, group: 2 },
    { label: "Open image in a new tab", action: { kind: "open", url: src }, group: 2 },
  ]
}

export function itemsFor(target: Element, selection: string): Item[] {
  const field = target.closest<HTMLElement>(FIELD)
  if (field) return fieldItems(field, selection)
  const link = target.closest("a[href]")?.getAttribute("href")
  const image = target.closest("img")
  return [
    ...(selection ? [{ label: "Copy", action: { kind: "copy", text: selection } as Action, hint: "⌘C", group: 0 }] : []),
    ...(link && !link.startsWith("#") ? linkItems(link) : []),
    ...(image?.getAttribute("src") ? imageItems(new URL(image.getAttribute("src")!, location.href).href) : []),
  ]
}
