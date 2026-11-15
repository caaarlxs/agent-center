// Where sessions run when the board wakes, opens or starts them: Claude
// desktop, or Claude Code's CLI in tmux (Setup → "Without Claude desktop",
// lib/terminal.ts on the server). The buttons and hints name that place.
import { useEffect } from "react"
import { setupStatus } from "@/features/setup/status"

export function useInTerminal() {
  const status = setupStatus.use()
  useEffect(() => void (!setupStatus.get() && setupStatus.load().catch(() => {})), [])
  return status?.sessions === "terminal"
}

// "Claude" (the desktop app) or "Terminal".
export const useClientName = () => (useInTerminal() ? "Terminal" : "Claude")
