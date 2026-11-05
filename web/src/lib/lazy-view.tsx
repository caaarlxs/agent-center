// A view whose code is not in the page's first download: it loads the first
// time it shows, and `preload` starts that load early (on hover of its tab), so
// the click finds it ready. `Loading` fills its place meanwhile, unless it
// has no place of its own (a dialog floats over the page): then nothing shows.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react"
import { Spinner } from "@/components/ui/spinner"
import { reloadForBuild } from "./stale-build"

export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>, { isFloating = false } = {}) {
  let loading: Promise<{ default: ComponentType<P> }> | null = null
  // A load that failed is not kept (Try again loads it again); a piece of an
  // old build gone loads the new build (stale-build.ts).
  const start = () =>
    (loading ??= load().then(view => ({ default: view }), err => {
      loading = null
      reloadForBuild(err)
      throw err
    }))
  const View = lazy(start)
  return Object.assign(
    (props: P) => (
      <Suspense fallback={isFloating ? null : <Loading />}>
        <View {...props} />
      </Suspense>
    ),
    { preload: () => void start() },
  )
}

export function Loading({ children }: { children?: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-text-muted"><Spinner />{children}</div>
}
