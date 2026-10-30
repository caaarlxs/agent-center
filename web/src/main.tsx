import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/doto" // the Dots style's numbers and zone names (index.css); loads only where used
import "./index.css"
import "./lib/board-style" // marks the page with its style before the first paint
import { App } from "./app/App"
import { Guard } from "./components/common/Guard"
import { loadAppIcon } from "./lib/app-icon"

loadAppIcon() // the tab shows the icon chosen in Settings

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Guard where="page"><App /></Guard>
  </StrictMode>,
)

// Installable, a copy for when the server is down, and notification clicks (public/sw.js).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {})
