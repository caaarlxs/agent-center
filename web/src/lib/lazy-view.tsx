// A view whose code is not in the page's first download: it loads the first
// time it shows, and `preload` starts that load early (on hover of its tab), so
// the click finds it ready. `Loading` fills its place meanwhile.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react"
import { Spinner } from "@/components/ui/spinner"

export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loading: Promise<{ default: ComponentType<P> }> | null = null
  const start = () => (loading ??= load().then(view => ({ default: view })))
  const View = lazy(start)
  return Object.assign(
    (props: P) => (
      <Suspense fallback={<Loading />}>
        <View {...props} />
      </Suspense>
    ),
    { preload: () => void start() },
  )
}

export function Loading({ children }: { children?: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-text-muted"><Spinner />{children}</div>
}
