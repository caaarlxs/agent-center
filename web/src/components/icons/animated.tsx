// The board's Lucide icons that move (Lucide Animated, MIT): the twin of the
// static icon, the same size and stroke, played while the pointer is on the
// button that holds it or the keyboard focus lands on it, and on the action
// itself where `play` changes. Reduced motion: MotionConfig at the app root.
// Until it first plays, the plain Lucide icon stands in: a card repeats a
// dozen of these, and only the one under the pointer needs Motion.
import {
  Archive, ArrowUp, ArrowUpRight, AudioLines, Bell, Check, Clock, Copy, ExternalLink, Eye, Gauge, GitPullRequest, Keyboard, LayoutGrid,
  type LucideIcon, Maximize2, Mic, Play, Plus, RotateCcw, Search, Send, Settings, Sun, X,
} from "lucide-react"
import { type CSSProperties, type ForwardRefExoticComponent, type HTMLAttributes, type RefAttributes, useEffect, useRef, useState } from "react"
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

function animated(Icon: Twin, Plain: LucideIcon, name: string) {
  function Animated({ size, className, play }: Props) {
    const handle = useRef<Handle>(null)
    const anchor = useRef<HTMLSpanElement>(null)
    // Live: the Motion twin is mounted; it plays as soon as it is.
    const [isLive, setLive] = useState(false)
    const wants = useRef(false)
    useEffect(() => {
      if (isLive && wants.current) (handle.current?.startAnimation(), (wants.current = false))
    }, [isLive])
    useEffect(() => {
      const host = anchor.current?.parentElement?.closest<HTMLElement>(HOST)
      if (!host) return
      const start = (e: Event) => {
        if (e.type === "pointerenter" && (e as PointerEvent).pointerType !== "mouse") return
        if (e.type === "focusin" && !(e.target as Element).matches?.(":focus-visible")) return
        if (!handle.current) return void ((wants.current = true), setLive(true))
        handle.current.startAnimation()
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
      if (!handle.current) return void ((wants.current = true), setLive(true))
      handle.current.startAnimation()
      const timer = setTimeout(() => handle.current?.stopAnimation(), PLAY_MS)
      return () => clearTimeout(timer)
    }, [play])
    const style = size ? ({ "--ico": `${size}px` } as CSSProperties) : undefined
    const box = cn("inline-flex shrink-0", size && "[&>svg]:size-(--ico)!", className)
    return (
      <span ref={anchor} className="contents">
        {isLive
          ? <Icon ref={handle} size={size ?? 16} aria-hidden style={style} className={box} />
          : <div aria-hidden style={style} className={box}><Plain size={size ?? 16} /></div>}
      </span>
    )
  }
  Animated.displayName = `Animated${name}`
  return Animated
}

export const Anim = {
  Archive: animated(ArchiveIcon, Archive, "Archive"),
  ArrowUp: animated(ArrowUpIcon, ArrowUp, "ArrowUp"),
  ArrowUpRight: animated(ArrowUpRightIcon, ArrowUpRight, "ArrowUpRight"),
  AudioLines: animated(AudioLinesIcon, AudioLines, "AudioLines"),
  Bell: animated(BellIcon, Bell, "Bell"),
  Check: animated(CheckIcon, Check, "Check"),
  Clock: animated(ClockIcon, Clock, "Clock"),
  Copy: animated(CopyIcon, Copy, "Copy"),
  ExternalLink: animated(ExternalLinkIcon, ExternalLink, "ExternalLink"),
  Eye: animated(EyeIcon, Eye, "Eye"),
  Gauge: animated(GaugeIcon, Gauge, "Gauge"),
  GitPullRequest: animated(GitPullRequestIcon, GitPullRequest, "GitPullRequest"),
  Keyboard: animated(KeyboardIcon, Keyboard, "Keyboard"),
  LayoutGrid: animated(LayoutGridIcon, LayoutGrid, "LayoutGrid"),
  Maximize2: animated(Maximize2Icon, Maximize2, "Maximize2"),
  Mic: animated(MicIcon, Mic, "Mic"),
  Play: animated(PlayIcon, Play, "Play"),
  Plus: animated(PlusIcon, Plus, "Plus"),
  RotateCcw: animated(RotateCCWIcon, RotateCcw, "RotateCcw"),
  Search: animated(SearchIcon, Search, "Search"),
  Send: animated(SendIcon, Send, "Send"),
  Settings: animated(SettingsIcon, Settings, "Settings"),
  Sun: animated(SunIcon, Sun, "Sun"),
  X: animated(XIcon, X, "X"),
}
