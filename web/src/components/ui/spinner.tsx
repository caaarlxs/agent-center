import { cn } from "cn"

// The board's spinner (styles.css:1141): a 16px brand ring with a gap, turning.
function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="spinner" role="status" aria-label="Loading" className={cn("spinner", className)} {...props} />
}

export { Spinner }
