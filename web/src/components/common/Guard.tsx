// A view that throws while it draws shows what broke and "Try again", not a
// blank page; the server writes it to its log (logs/client-errors.log). A
// piece of an old build that is gone loads the new build instead.
import { Component, type ErrorInfo, type ReactNode } from "react"
import { post } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { isStaleBuild, reloadForBuild } from "@/lib/stale-build"

type Props = { where: string; children: ReactNode }

export class Guard extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (reloadForBuild(error)) return
    void post("/api/clienterror", { where: this.props.where, message: error.message, stack: error.stack, componentStack: info.componentStack }).catch(() => {})
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (isStaleBuild(error))
      return (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="m-0 text-[13px] font-semibold text-text">Agent Center was updated</p>
          <Button variant="outline" onClick={() => location.reload()}>Reload</Button>
        </div>
      )
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="m-0 text-[13px] font-semibold text-text">This view broke</p>
        <code className="max-w-[560px] font-mono text-[11.5px] break-words text-text-muted">{error.message}</code>
        <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
