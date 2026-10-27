import { cn } from "cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-[18px] w-fit min-w-[18px] items-center justify-center gap-1 rounded-[5px] border border-b-2 border-line-strong bg-surface px-[5px] font-sans text-[10.5px] leading-none font-medium text-text-muted select-none in-data-[slot=button]:border-current/35 in-data-[slot=button]:bg-transparent in-data-[slot=button]:text-current in-data-[slot=tooltip-content]:border-background/30 in-data-[slot=tooltip-content]:bg-transparent in-data-[slot=tooltip-content]:text-background [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
