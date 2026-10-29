// What a right-click offers, by what is under it: a link (open it, copy it),
// an email (write to it, copy the address), the same for an email or an
// address only written as text (or as code), an image (see it large, copy
// it, copy its address), a field (cut, copy, paste, select all), and the
// text you selected (copy). Else the message's text to copy, and a reload:
// the menu always shows, as some windows have none of their own.

export type Action =
  | { kind: "copy"; text: string }
  | { kind: "open"; url: string }
  | { kind: "image"; src: string }
  | { kind: "copyImage"; src: string }
  | { kind: "cut" | "paste" | "selectAll"; field: HTMLElement }
  | { kind: "reload" }
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

const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/
const URL_TEXT = /^(https?:\/\/|www\.)\S+$/

// An email or an address in the word under the cursor, its quotes, code
// marks and closing punctuation left out.
export function addressIn(word: string): string | null {
  const bare = word.replace(/^[`'"(<[{¡¿]+/, "").replace(/[`'")>\]},.;:!?]+$/, "")
  if (EMAIL.test(bare)) return `mailto:${bare}`
  if (URL_TEXT.test(bare)) return bare.startsWith("www.") ? `https://${bare}` : bare
  return null
}

// Where nothing else applies: the message's text, and a reload.
function fallbackItems(target: Element): Item[] {
  const message = target.closest<HTMLElement>(".md")
  return [
    ...(message?.innerText.trim() ? [{ label: "Copy text", action: { kind: "copy", text: message.innerText.trim() } as Action, group: 0 }] : []),
    { label: "Reload page", action: { kind: "reload" }, hint: "⌘R", group: 1 },
  ]
}

export function itemsFor(target: Element, selection: string, word = ""): Item[] {
  const field = target.closest<HTMLElement>(FIELD)
  if (field) return fieldItems(field, selection)
  const href = target.closest("a[href]")?.getAttribute("href")
  const link = href && !href.startsWith("#") ? href : addressIn(word)
  const image = target.closest("img")
  const items = [
    ...(selection ? [{ label: "Copy", action: { kind: "copy", text: selection } as Action, hint: "⌘C", group: 0 }] : []),
    ...(link ? linkItems(link) : []),
    ...(image?.getAttribute("src") ? imageItems(new URL(image.getAttribute("src")!, location.href).href) : []),
  ]
  return items.length ? items : fallbackItems(target)
}
