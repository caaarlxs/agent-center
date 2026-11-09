// Whether a press outside the session panel closes it: only on empty space
// (the canvas's background, a view's own background). A press on anything
// with its own action (a button, a link, a field, another card, a note, a
// toast's close) does that action and the panel stays (another card swaps
// it). The panel itself, the sidebar, dialogs, menus and what marks itself
// (data-keeps-panel) keep it as before.
export const KEEPS_PANEL = "[data-panel], [data-panel-edge], [data-sidebar], [data-keeps-panel], [role=menu], [role=dialog], [data-slot=dialog-overlay], [role=listbox], [data-sonner-toaster], [data-sonner-toast], [data-scrim]"
const ACTS = "button, a[href], input, textarea, select, label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [contenteditable=''], [contenteditable=true], [data-id], .react-flow__node, [tabindex]:not([tabindex='-1'])"

export function closesPanel(target: Element) {
  return !target.closest(KEEPS_PANEL) && !target.closest(ACTS)
}
