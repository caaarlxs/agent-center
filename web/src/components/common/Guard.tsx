// A view that throws while it draws shows what broke and "Try again", not a
// blank page; the server writes it to its log (logs/client-errors.log).
import { Component, type ErrorInfo, type ReactNode } from "react"
import { post } from "@/lib/api"
import { Button } from "@/components/ui/button"

type Props = { where: string; children: ReactNode }

export class Guard extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void post("/api/clienterror", { where: this.props.where, message: error.message, stack: error.stack, componentStack: info.componentStack }).catch(() => {})
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="m-0 text-[13px] font-semibold text-text">This view broke</p>
        <code className="max-w-[560px] font-mono text-[11.5px] break-words text-text-muted">{error.message}</code>
        <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
