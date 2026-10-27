import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      visibleToasts={3}
      duration={3500}
      offset={20}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Inverted, as the classic board's (styles.css:1021-1031).
          "--normal-bg": "var(--text)",
          "--normal-text": "var(--bg)",
          "--normal-border": "transparent",
          "--border-radius": "10px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !w-auto !max-w-[min(460px,calc(100vw-40px))] !gap-3.5 !py-2.5 !pr-3 !pl-3.5 !text-[13px] !shadow-pop",
          title: "truncate",
          actionButton: "!bg-transparent !px-0 !text-[13px] !font-[650] !text-brand !gap-1.5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
