// The board's Lucide icons that move (Lucide Animated, MIT): the twin of the
// static icon, the same size and stroke, played while the pointer is on the
// button that holds it or the keyboard focus lands on it, and on the action
// itself where `play` changes. Reduced motion: MotionConfig at the app root.
import { type CSSProperties, type ForwardRefExoticComponent, type HTMLAttributes, type RefAttributes, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { ArchiveIcon } from "./archive"
import { ArrowUpIcon } from "./arrow-up"
import { ArrowUpRightIcon } from "./arrow-up-right"
import { AudioLinesIcon } from "./audio-lines"
import { BellIcon } from "./bell"
import { CheckIcon } from "./check"
import { ClockIcon } from "./clock"
import { CopyIcon } from "./copy"
import { ExternalLinkIcon } from "./external-link"
import { EyeIcon } from "./eye"
import { GaugeIcon } from "./gauge"
import { GitPullRequestIcon } from "./git-pull-request"
import { KeyboardIcon } from "./keyboard"
import { LayoutGridIcon } from "./layout-grid"
import { Maximize2Icon } from "./maximize-2"
import { MicIcon } from "./mic"
import { PlayIcon } from "./play"
import { PlusIcon } from "./plus"
import { RotateCCWIcon } from "./rotate-ccw"
import { SearchIcon } from "./search"
import { SendIcon } from "./send"
import { SettingsIcon } from "./settings"
import { SunIcon } from "./sun"
import { XIcon } from "./x"

type Handle = { startAnimation: () => void; stopAnimation: () => void }
type Twin = ForwardRefExoticComponent<HTMLAttributes<HTMLDivElement> & { size?: number } & RefAttributes<Handle>>
// size: the static icon's, in px; without it a parent's [&_svg]:size-* sizes it.
// play: a value that changes when the action happens replays it once.
type Props = { size?: number; className?: string; play?: unknown }

const HOST = "button, a, [role=button], [role=menuitem], [role=tab], label"
const PLAY_MS = 700

function animated(Icon: Twin, name: string) {
  function Animated({ size, className, play }: Props) {
    const handle = useRef<Handle>(null)
    const anchor = useRef<HTMLSpanElement>(null)
    useEffect(() => {
      const host = anchor.current?.parentElement?.closest<HTMLElement>(HOST)
      if (!host) return
      const start = (e: Event) => {
        if (e.type === "pointerenter" && (e as PointerEvent).pointerType !== "mouse") return
        if (e.type === "focusin" && !(e.target as Element).matches?.(":focus-visible")) return
        handle.current?.startAnimation()
      }
      const stop = () => handle.current?.stopAnimation()
      const on: [string, (e: Event) => void][] = [["pointerenter", start], ["pointerleave", stop], ["focusin", start], ["focusout", stop]]
      for (const [type, fn] of on) host.addEventListener(type, fn)
      return () => { for (const [type, fn] of on) host.removeEventListener(type, fn) }
    }, [])
    const played = useRef(play)
    useEffect(() => {
      if (Object.is(played.current, play)) return
      played.current = play
      handle.current?.startAnimation()
      const timer = setTimeout(() => handle.current?.stopAnimation(), PLAY_MS)
      return () => clearTimeout(timer)
    }, [play])
    return (
      <span ref={anchor} className="contents">
        <Icon ref={handle} size={size ?? 16} aria-hidden style={size ? { "--ico": `${size}px` } as CSSProperties : undefined}
          className={cn("inline-flex shrink-0", size && "[&>svg]:size-(--ico)!", className)} />
      </span>
    )
  }
  Animated.displayName = `Animated${name}`
  return Animated
}

export const Anim = {
  Archive: animated(ArchiveIcon, "Archive"),
  ArrowUp: animated(ArrowUpIcon, "ArrowUp"),
  ArrowUpRight: animated(ArrowUpRightIcon, "ArrowUpRight"),
  AudioLines: animated(AudioLinesIcon, "AudioLines"),
  Bell: animated(BellIcon, "Bell"),
  Check: animated(CheckIcon, "Check"),
  Clock: animated(ClockIcon, "Clock"),
  Copy: animated(CopyIcon, "Copy"),
  ExternalLink: animated(ExternalLinkIcon, "ExternalLink"),
  Eye: animated(EyeIcon, "Eye"),
  Gauge: animated(GaugeIcon, "Gauge"),
  GitPullRequest: animated(GitPullRequestIcon, "GitPullRequest"),
  Keyboard: animated(KeyboardIcon, "Keyboard"),
  LayoutGrid: animated(LayoutGridIcon, "LayoutGrid"),
  Maximize2: animated(Maximize2Icon, "Maximize2"),
  Mic: animated(MicIcon, "Mic"),
  Play: animated(PlayIcon, "Play"),
  Plus: animated(PlusIcon, "Plus"),
  RotateCcw: animated(RotateCCWIcon, "RotateCcw"),
  Search: animated(SearchIcon, "Search"),
  Send: animated(SendIcon, "Send"),
  Settings: animated(SettingsIcon, "Settings"),
  Sun: animated(SunIcon, "Sun"),
  X: animated(XIcon, "X"),
}
