// A Word or Excel file as the server converts it (lib/office.ts): HTML with its
// styles. It is cleaned (DOMPurify: no script, no form) and drawn in a shadow
// root, so its styles stay in it and the page's stay out; a link to one of
// its own anchors (an Excel sheet) scrolls there.
import DOMPurify from "dompurify"
import { useEffect, useRef, useState } from "react"

export function OfficeDoc({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(url)
      .then(r => (r.ok ? r.text() : r.json().then(b => Promise.reject(new Error(b.error ?? `${r.status}`)))))
      .then(html => {
        const el = host.current
        if (!alive || !el) return
        const root = el.shadowRoot ?? el.attachShadow({ mode: "open" })
        root.innerHTML = DOMPurify.sanitize(html, { ADD_TAGS: ["style"], FORCE_BODY: true, FORBID_TAGS: ["form", "input", "button"] })
        root.addEventListener("click", e => {
          const a = (e.target as HTMLElement).closest?.("a[href^='#']")
          if (!a) return
          e.preventDefault()
          root.getElementById(a.getAttribute("href")!.slice(1))?.scrollIntoView({ block: "start" })
        })
      }, (err: Error) => alive && setError(err.message))
    return () => void (alive = false)
  }, [url])
  if (error) return <p className="p-6 text-sm text-muted-foreground">{error}</p>
  return <div ref={host} className="min-h-0 flex-1 overflow-auto bg-white text-[#1d1d1f]" />
}
