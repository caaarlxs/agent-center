import { Toaster as Sonner, type ToasterProps } from "sonner"
import { theme as pageTheme } from "@/lib/theme"
import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react"

// The toasts: at the bottom in the middle, a card with its kind's icon in a
// tile of its colour, a title and its detail, a pill for its action and a
// thin bar that runs out with it (index.css, .cn-toast). Kinds: lib/notify.ts.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = pageTheme.use() // the page's light or dark, not only the system's
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      visibleToasts={3}
      duration={4500}
      offset={24}
      gap={10}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-[17px]" strokeWidth={2.2} />,
        info: <Info className="size-[17px]" strokeWidth={2.2} />,
        warning: <TriangleAlert className="size-[17px]" strokeWidth={2.2} />,
        error: <CircleX className="size-[17px]" strokeWidth={2.2} />,
        loading: <Loader2 className="size-[17px] animate-spin" strokeWidth={2.2} />,
      }}
      style={
        {
          "--normal-bg": "var(--raised)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line)",
          "--toast-button-margin-start": "auto",
          "--border-radius": "14px",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast", title: "cn-toast-title", description: "cn-toast-text", actionButton: "cn-toast-action", cancelButton: "cn-toast-cancel" } }}
      {...props}
    />
  )
}

export { Toaster }
