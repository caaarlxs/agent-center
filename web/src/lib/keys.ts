// Whether a key goes to a field (an input, a text area, the code editor):
// then the board's shortcuts keep out of its way.
export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest(".monaco-editor"))
