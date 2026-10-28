import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./app/App"
import { Guard } from "./components/common/Guard"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Guard where="page"><App /></Guard>
  </StrictMode>,
)

// Installable, a copy for when the server is down, and notification clicks (public/sw.js).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {})
