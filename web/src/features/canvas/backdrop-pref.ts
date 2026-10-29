// Whether the canvas draws its animated background (Backdrop.tsx): off until
// you turn it on in Settings › Look. Apart, so Settings does not load the shader.
import { persistedStore } from "@/lib/store"

export const animatedBackdrop = persistedStore<"on" | "off">("canvasBackdrop", "off")
