// What a stage keeps for whoever goes looking: a quiet button that unfolds it.
import { ChevronRight } from "lucide-react"
import { type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"

export function FoldButton({ label, isOpen, onToggle }: { label: ReactNode; isOpen: boolean; onToggle: () => void }) {
  return (
    <button className={cn("inline-flex items-center gap-1 self-start text-xs font-semibold transition-colors duration-120", isOpen ? "text-text" : "text-text-muted hover:text-text")} onClick={onToggle} aria-expanded={isOpen}>
      <ChevronRight size={13} className={cn("transition-transform duration-150 ease-(--ease-out)", isOpen && "rotate-90")} />{label}
    </button>
  )
}

export function Details({ children, label = "Details" }: { children: ReactNode; label?: string }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <FoldButton label={label} isOpen={isOpen} onToggle={() => setOpen(o => !o)} />
      {isOpen && children}
    </div>
  )
}
