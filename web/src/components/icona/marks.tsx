// The board's moments, each an Icona motion that tells what just happened:
// the message leaves (paper plane), a copy (duplicate, then the check stamp),
// a PR merged or a task closed (check burst), an archive (into the bin), a
// session that starts asking (bell), Run starting (play to pause). Each
// shows the moment while `step` says so, else the icon the place had.
import type { ReactNode } from "react"
import { BellRingIcon } from "./bell-ring"
import { CheckCircleSuccessBurstIcon } from "./check-circle-success-burst"
import { CheckStampIcon } from "./check-stamp"
import { CopyDuplicateIcon } from "./copy-duplicate"
import { Once, useMoment } from "./moment"
import { PaperPlaneFlyCurveIcon } from "./paper-plane-fly-curve"
import { PlayMorphToPauseIcon } from "./play-morph-to-pause"
import { TrashDropItInIcon } from "./trash-drop-it-in"

type Moment = ReturnType<typeof useMoment>
type Mark = { moment: Moment; size: number; idle?: ReactNode; className?: string }

// Speeds: deliberate, yet short; the ms below are each pass at that speed.
const SEND = { speed: 1.6, ms: 1560 }
const DUPLICATE = { speed: 2.5, ms: 680 }
const STAMP = { speed: 1.5, ms: 930 }
const BURST = { speed: 1, ms: 1300 }
const DROP = { speed: 1.5, ms: 1200 }
const RING = { speed: 1.25, ms: 1400 }
const MORPH = { speed: 2, ms: 640 }

export const useSendMoment = () => useMoment(SEND.ms)
export const useCopyMoment = () => useMoment(DUPLICATE.ms, STAMP.ms)
export const useDoneMoment = () => useMoment(BURST.ms)
export const useArchiveMoment = () => useMoment(DROP.ms)
export const useAskMoment = () => useMoment(RING.ms)
export const useRunMoment = () => useMoment(MORPH.ms)

export function SendMark({ moment, size, idle, className }: Mark) {
  return moment.step === 0 ? <Once key={moment.key} icon={PaperPlaneFlyCurveIcon} size={size} speed={SEND.speed} className={className} /> : idle
}
export function CopyMark({ moment, size, idle, className }: Mark) {
  if (moment.step === 0) return <Once key={`d${moment.key}`} icon={CopyDuplicateIcon} size={size} speed={DUPLICATE.speed} className={className} />
  if (moment.step === 1) return <Once key={`s${moment.key}`} icon={CheckStampIcon} size={size} speed={STAMP.speed} className={className} />
  return idle
}
export function DoneMark({ moment, size, idle, className }: Mark) {
  return moment.step === 0 ? <Once key={moment.key} icon={CheckCircleSuccessBurstIcon} size={size} speed={BURST.speed} className={className} /> : idle
}
export function ArchiveMark({ moment, size, idle, className }: Mark) {
  return moment.step === 0 ? <Once key={moment.key} icon={TrashDropItInIcon} size={size} speed={DROP.speed} className={className} /> : idle
}
export function AskMark({ moment, size, idle, className }: Mark) {
  return moment.step === 0 ? <Once key={moment.key} icon={BellRingIcon} size={size} speed={RING.speed} className={className} /> : idle
}
export function RunMark({ moment, size, idle, className }: Mark) {
  return moment.step === 0 ? <Once key={moment.key} icon={PlayMorphToPauseIcon} size={size} speed={MORPH.speed} className={className} /> : idle
}

// A toast's icon for the moment it reports: the card into the bin, the
// check burst for a PR merged or a task closed. It plays as the toast shows.
export const archivedIcon = () => <Once icon={TrashDropItInIcon} size={15} speed={DROP.speed} />
export const doneIcon = () => <Once icon={CheckCircleSuccessBurstIcon} size={15} speed={BURST.speed} className="text-work" />
