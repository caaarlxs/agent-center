// A short chime played by the page (Web Audio, no file): two soft notes going
// up when a turn ends, the same two higher when a session asks you something.
// The browser keeps a page silent until the first click or key; that wakes it.
let audio: AudioContext | null = null
const wake = () => audio?.state === "suspended" && audio.resume().catch(() => {})
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, wake, { capture: true })

const NOTES = { done: [659.25, 987.77], ask: [880, 1318.51] }

export function chime(kind: keyof typeof NOTES = "done") {
  audio ??= new AudioContext()
  wake()
  const start = audio.currentTime + 0.02
  NOTES[kind].forEach((freq, i) => {
    const at = start + i * 0.12
    const osc = audio!.createOscillator()
    const gain = audio!.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.12, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
    osc.connect(gain).connect(audio!.destination)
    osc.start(at)
    osc.stop(at + 0.5)
  })
}
