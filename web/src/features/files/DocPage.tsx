// A Markdown document as a page you can write on: a click on a box ticks it
// in the file; a double-click on a block (or its pencil) turns it into its
// Markdown to write, a blank ("____") picked ready to type over; ⌘↵ or a
// click away saves it, Esc leaves it as it was.
import { Pencil } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Markdown } from "@/features/conversation/Markdown"
import { blocksOf, toggleBox, withBlock } from "./beside"

function BlockEditor({ text, onDone }: { text: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const isDone = useRef(false)
  const done = (value: string | null) => void (isDone.current || ((isDone.current = true), onDone(value)))
  useEffect(() => {
    const el = ref.current!
    const blank = /_{3,}/.exec(text)
    el.focus()
    if (blank) el.setSelectionRange(blank.index, blank.index + blank[0].length)
    else el.setSelectionRange(text.length, text.length)
  }, [text])
  return (
    <textarea ref={ref} defaultValue={text} spellCheck={false} aria-label="Edit this block"
      onBlur={e => done(e.currentTarget.value)}
      onKeyDown={e => {
        if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), done(null))
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), done(e.currentTarget.value))
      }}
      className="doc-editor my-1 block w-full resize-none rounded-lg border border-brand bg-bg px-3 py-2 font-mono text-[13px] leading-[1.6] text-text shadow-[0_0_0_3px_var(--brand-soft)] outline-none [field-sizing:content]" />
  )
}

export function DocPage({ text, onSave }: { text: string; onSave: (text: string) => Promise<boolean> }) {
  const blocks = useMemo(() => blocksOf(text), [text])
  const [editing, setEditing] = useState<number | null>(null)
  // A box's number is its place among the page's boxes, as toggleBox counts them.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = (e.target as HTMLElement).closest(".doc-box")
    if (box) void onSave(toggleBox(text, [...e.currentTarget.querySelectorAll(".doc-box")].indexOf(box)))
  }
  const edit = (i: number) => (e: React.MouseEvent) => void ((e.target as HTMLElement).closest(".doc-box, a") || setEditing(i))
  return (
    <div className="doc-page mx-auto max-w-[760px] px-[22px] pt-[18px] pb-10" onClick={onClick}>
      {blocks.map((block, i) => i === editing
        ? <BlockEditor key={i} text={block.replace(/\s+$/, "")} onDone={value => {
            setEditing(null)
            if (value !== null && value.trim() !== block.trim()) void onSave(withBlock(blocks, i, value))
          }} />
        : (
          <div key={i} className="doc-block group/block relative" onDoubleClick={edit(i)}>
            <Markdown isDocument className="file-md">{block}</Markdown>
            <button onClick={() => setEditing(i)} title="Write here (or double-click)" aria-label="Edit this block"
              className="absolute top-0.5 -left-6 grid size-5 place-items-center rounded-md text-faint opacity-0 transition-opacity group-hover/block:opacity-100 hover:bg-hover hover:text-text">
              <Pencil className="size-3" />
            </button>
          </div>
        ))}
    </div>
  )
}
