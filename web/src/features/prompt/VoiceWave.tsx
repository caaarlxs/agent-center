// The dictation pill's clock. The voice itself shows as the reply box's glow
// (voice-glow, in the composer): it follows the microphone while you speak
// and sweeps while Whisper writes it out.
import { Num } from "@/components/common/Num"

// The time it has recorded, "0:07", its digits rolling.
export const Elapsed = ({ seconds }: { seconds: number }) => <Num value={seconds % 60} prefix={`${Math.floor(seconds / 60)}:`} minDigits={2} />
