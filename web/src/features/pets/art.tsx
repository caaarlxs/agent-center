// The pets' drawings: twenty-eight species, each in twelve skins (lib/pets.ts says
// which skin is how rare). One 64 × 64 drawing per pet, its parts named for
// the motion in index.css (.pet-body bobs, .pet-foot steps, .pet-tail wags,
// .pet-eyes blink). The rarer skins paint with gradients and patterns, and
// glow (.pet-fx-*).
import { useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Rarity = "common" | "rare" | "epic" | "legendary"

type Colors = { body: string; belly: string; accent: string }
type Paint = Colors & { ink: string; shine: string; cheek: string; defs: ReactNode; fx: string | null }

const BASE: Record<string, Colors> = {
  cat: { body: "#f2a65a", belly: "#ffe7c9", accent: "#d9783a" },
  dog: { body: "#dcaa72", belly: "#fff2df", accent: "#8b5a2b" },
  fox: { body: "#f07f3c", belly: "#fff4e6", accent: "#3a2e2a" },
  bunny: { body: "#efe9e1", belly: "#ffffff", accent: "#f4a7b9" },
  frog: { body: "#7cc95e", belly: "#dcf3bd", accent: "#4f9b3b" },
  owl: { body: "#a97b53", belly: "#f2ddc1", accent: "#f2b134" },
  penguin: { body: "#323844", belly: "#ffffff", accent: "#f6a531" },
  axolotl: { body: "#ffb5c8", belly: "#ffe2ea", accent: "#ff6f9a" },
  panda: { body: "#fbfbfb", belly: "#ffffff", accent: "#2b2b2e" },
  bear: { body: "#9c6b45", belly: "#e8c7a1", accent: "#6e4529" },
  duck: { body: "#ffd84a", belly: "#fff4b5", accent: "#ff9a2e" },
  slime: { body: "#6fd3a4", belly: "#b8f1d5", accent: "#3aa877" },
  ghost: { body: "#f4f2ff", belly: "#ffffff", accent: "#c3bbff" },
  robot: { body: "#b9c3cf", belly: "#e8edf2", accent: "#4fd1ff" },
  dragon: { body: "#6bbf6b", belly: "#f3e7a6", accent: "#e8a33b" },
  octopus: { body: "#b07cf2", belly: "#e5d0fc", accent: "#8a52d9" },
  unicorn: { body: "#fbf8ff", belly: "#ffffff", accent: "#c08bff" },
  capybara: { body: "#b9875a", belly: "#d9b08a", accent: "#7a5536" },
  hamster: { body: "#f4c27f", belly: "#fff6e8", accent: "#d98e3a" },
  shark: { body: "#7a97b8", belly: "#f2f6fa", accent: "#4d6a8c" },
  dino: { body: "#7bc96f", belly: "#e8f5c8", accent: "#ff9a52" },
  phoenix: { body: "#ff7b3d", belly: "#ffe1a8", accent: "#ff3d2e" },
  mushroom: { body: "#e8473d", belly: "#fff6ea", accent: "#c7342b" },
  alien: { body: "#8ee26b", belly: "#cdf7b4", accent: "#ff5cc8" },
  astronaut: { body: "#f3f5f8", belly: "#dfe4ea", accent: "#ff7a3d" },
  wizard: { body: "#4f5bd5", belly: "#f2f2f2", accent: "#3a2f9e" },
  ninja: { body: "#2e3140", belly: "#ffd9b8", accent: "#e8473d" },
  pirate: { body: "#2b2b33", belly: "#ffd9b8", accent: "#e8473d" },
}

export const SPECIES_NAME: Record<string, string> = {
  cat: "Cat", dog: "Pup", fox: "Fox", bunny: "Bunny", frog: "Frog", owl: "Owl", penguin: "Penguin", axolotl: "Axolotl",
  panda: "Panda", bear: "Bear", duck: "Duck", slime: "Slime", ghost: "Ghost", robot: "Robot", dragon: "Dragon", octopus: "Octopus",
  unicorn: "Unicorn", capybara: "Capybara", hamster: "Hamster", shark: "Shark", dino: "Dino", phoenix: "Phoenix",
  mushroom: "Shroom", alien: "Alien", astronaut: "Astronaut", wizard: "Wizard", ninja: "Ninja", pirate: "Pirate",
}
export const SKIN_NAME: Record<string, string> = {
  classic: "Classic", snow: "Snow", cocoa: "Cocoa", mint: "Mint", sakura: "Sakura", ocean: "Ocean",
  neon: "Neon", shadow: "Shadow", lava: "Lava", gold: "Golden", galaxy: "Galaxy", holo: "Holo",
}
// Pets adopted from codex-pets.net ("community:<id>"): their names and the
// sizes of their sheets, as the server lists them (pets.ts keeps this up).
export type Adopted = { id: string; name: string; description: string; source: string; cell: [number, number]; atlas: [number, number]; rarity?: Rarity; category?: string }
const adoptedPets = new Map<string, Adopted>()
export const setAdopted = (list: Adopted[]) => (adoptedPets.clear(), list.forEach(p => adoptedPets.set(p.id, p)))
export const COMMUNITY = "community:"
export const isCommunity = (id: string) => id.startsWith(COMMUNITY)

export const petName = (id: string) => {
  if (isCommunity(id)) return adoptedPets.get(id.slice(COMMUNITY.length))?.name ?? "Community pet"
  const [species = "", skin = ""] = id.split(":")
  return skin === "classic" ? SPECIES_NAME[species] ?? species : `${SKIN_NAME[skin] ?? skin} ${SPECIES_NAME[species] ?? species}`
}

export const RARITY_COLOR: Record<Rarity, string> = { common: "#9a968c", rare: "#3b9cff", epic: "#b45cff", legendary: "#ffb627" }
export const RARITY_NAME: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" }

const SKIN: Record<string, Partial<Colors>> = {
  snow: { body: "#f5f5f2", belly: "#ffffff", accent: "#c4d0dc" },
  cocoa: { body: "#8a5a3c", belly: "#dcb894", accent: "#5a3722" },
  mint: { body: "#8fe3c0", belly: "#e8fff5", accent: "#36b383" },
  sakura: { body: "#f7b6cf", belly: "#fff0f6", accent: "#e5709b" },
  ocean: { body: "#6fb4f2", belly: "#e0f2ff", accent: "#2a78cc" },
  neon: { body: "#1c1b30", belly: "#2b2950", accent: "#39ff9c" },
  shadow: { body: "#2a2533", belly: "#3c3548", accent: "#a083ff" },
  lava: { body: "#3b1e18", belly: "#ff7a2f", accent: "#ffcf3f" },
}

function paintOf(species: string, skin: string, uid: string): Paint {
  const base = BASE[species] ?? BASE.cat!
  const plain = { ink: "#2b2320", shine: "#ffffff", cheek: "#ff8fa3", defs: null, fx: null }
  if (skin === "classic" || !skin) return { ...base, ...plain }
  if (SKIN[skin]) {
    const c = { ...base, ...SKIN[skin] }
    const ink = skin === "neon" ? "#39ff9c" : skin === "shadow" ? "#cdb8ff" : skin === "lava" ? "#ffcf3f" : plain.ink
    return { ...c, ...plain, ink, cheek: skin === "neon" || skin === "shadow" || skin === "lava" ? c.accent : plain.cheek, fx: ["neon", "shadow", "lava"].includes(skin) ? skin : null }
  }
  const g = (name: string) => `url(#${uid}-${name})`
  if (skin === "gold")
    return {
      body: g("b"), belly: g("l"), accent: "#c58d12", ink: "#4a3205", shine: "#fffbe6", cheek: "#ffb36b", fx: "gold",
      defs: (
        <>
          <linearGradient id={`${uid}-b`} x1="10" y1="8" x2="54" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff6c2" /><stop offset="0.35" stopColor="#f7c948" /><stop offset="0.7" stopColor="#d99a1e" /><stop offset="1" stopColor="#a8700c" />
          </linearGradient>
          <linearGradient id={`${uid}-l`} x1="20" y1="30" x2="44" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffbe3" /><stop offset="1" stopColor="#f6d77a" />
          </linearGradient>
        </>
      ),
    }
  if (skin === "galaxy")
    return {
      body: g("b"), belly: g("l"), accent: "#ff7ad9", ink: "#ffffff", shine: "#ffffff", cheek: "#ff7ad9", fx: "galaxy",
      defs: (
        <>
          <radialGradient id={`${uid}-g`} cx="24" cy="22" r="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6f4ef0" /><stop offset="0.55" stopColor="#30217e" /><stop offset="1" stopColor="#120c33" />
          </radialGradient>
          <pattern id={`${uid}-b`} width="64" height="64" patternUnits="userSpaceOnUse">
            <rect width="64" height="64" fill={`url(#${uid}-g)`} />
            {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" opacity={0.55 + r * 0.3} />)}
          </pattern>
          <linearGradient id={`${uid}-l`} x1="20" y1="30" x2="44" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5a3fc8" /><stop offset="1" stopColor="#ff7ad9" stopOpacity="0.85" />
          </linearGradient>
        </>
      ),
    }
  // holo: a rainbow foil whose hues turn (.pet-fx-holo)
  return {
    body: g("b"), belly: g("l"), accent: "#7a5cff", ink: "#2d2350", shine: "#ffffff", cheek: "#ff8fd0", fx: "holo",
    defs: (
      <>
        <linearGradient id={`${uid}-b`} x1="8" y1="8" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd6f5" /><stop offset="0.25" stopColor="#bde6ff" /><stop offset="0.5" stopColor="#c9ffe5" />
          <stop offset="0.75" stopColor="#fff2b8" /><stop offset="1" stopColor="#e2c8ff" />
        </linearGradient>
        <linearGradient id={`${uid}-l`} x1="56" y1="20" x2="16" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e9dcff" />
        </linearGradient>
      </>
    ),
  }
}

const STARS: [number, number, number][] = [
  [12, 14, 0.6], [22, 9, 0.9], [36, 16, 0.5], [48, 11, 0.8], [17, 28, 0.5], [42, 27, 0.9], [28, 36, 0.6],
  [52, 33, 0.5], [10, 42, 0.8], [36, 46, 0.5], [22, 50, 0.9], [47, 51, 0.6], [30, 22, 0.4], [56, 22, 0.6],
]

// ---------- the parts every pet shares ----------

function Eyes({ p, y = 30, gap = 6.5, size = 1, cx = 32 }: { p: Paint; y?: number; gap?: number; size?: number; cx?: number }) {
  return (
    <g className="pet-eyes">
      {[-1, 1].map(s => (
        <g key={s}>
          <ellipse cx={cx + s * gap} cy={y} rx={2.3 * size} ry={2.9 * size} fill={p.ink} />
          <circle cx={cx + s * gap + 0.8 * size} cy={y - 1.1 * size} r={0.9 * size} fill={p.shine} />
        </g>
      ))}
    </g>
  )
}
const Cheeks = ({ p, y = 34, gap = 10.5 }: { p: Paint; y?: number; gap?: number }) => (
  <>{[-1, 1].map(s => <ellipse key={s} cx={32 + s * gap} cy={y} rx="2.6" ry="1.6" fill={p.cheek} opacity="0.45" />)}</>
)
const Mouth = ({ p, y = 35 }: { p: Paint; y?: number }) => (
  <path d={`M29.6 ${y} q1.2 1.6 2.4 0 q1.2 1.6 2.4 0`} fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
)
const Feet = ({ color, y = 57, gap = 6 }: { color: string; y?: number; gap?: number }) => (
  <g className="pet-feet">
    <ellipse className="pet-foot pet-foot-l" cx={32 - gap} cy={y} rx="4" ry="2.6" fill={color} />
    <ellipse className="pet-foot pet-foot-r" cx={32 + gap} cy={y} rx="4" ry="2.6" fill={color} />
  </g>
)
// A soft shade on the lower half, so a flat colour reads round.
const Shade = ({ cx = 32, cy = 50, rx = 13, ry = 7 }: { cx?: number; cy?: number; rx?: number; ry?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity="0.07" />
)

// ---------- the species ----------

type Draw = (p: Paint) => { back?: ReactNode; feet?: ReactNode; body: ReactNode }

const DRAW: Record<string, Draw> = {
  cat: p => ({
    back: <path className="pet-tail" d="M42 50 C52 50 54 40 50 33" fill="none" stroke={p.body} strokeWidth="4.5" strokeLinecap="round" />,
    feet: <Feet color={p.body} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12.5" ry="10" fill={p.body} />
        <ellipse cx="32" cy="49" rx="7.5" ry="6.5" fill={p.belly} />
        <path d="M17 26 L19 11 L29 19 Z" fill={p.body} /><path d="M47 26 L45 11 L35 19 Z" fill={p.body} />
        <path d="M19.6 22 L20.6 14.5 L26 19 Z" fill={p.cheek} opacity="0.7" /><path d="M44.4 22 L43.4 14.5 L38 19 Z" fill={p.cheek} opacity="0.7" />
        <ellipse cx="32" cy="29" rx="16" ry="13" fill={p.body} />
        <path d="M27 17.5 l1.5 4 M32 16.5 v4.5 M37 17.5 l-1.5 4" stroke={p.accent} strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="32" cy="35" rx="6" ry="4" fill={p.belly} />
        <Eyes p={p} /><Cheeks p={p} />
        <path d="M31 32.6 h2 l-1 1.1 z" fill={p.cheek} />
        <Mouth p={p} y={34.2} />
        <path d="M14 31 h6 M14.5 34 l5.5 -1 M50 31 h-6 M49.5 34 l-5.5 -1" stroke={p.ink} strokeWidth="0.7" opacity="0.5" strokeLinecap="round" />
        <Shade />
      </>
    ),
  }),
  dog: p => ({
    back: <path className="pet-tail" d="M43 48 q8 -2 8 -10" fill="none" stroke={p.body} strokeWidth="4" strokeLinecap="round" />,
    feet: <Feet color={p.belly} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12.5" ry="10" fill={p.body} />
        <ellipse cx="32" cy="49" rx="7.5" ry="6.5" fill={p.belly} />
        <ellipse cx="32" cy="29" rx="15.5" ry="13.5" fill={p.body} />
        <ellipse className="pet-ear-l" cx="17.5" cy="28" rx="4.8" ry="9" fill={p.accent} transform="rotate(18 17.5 28)" />
        <ellipse className="pet-ear-r" cx="46.5" cy="28" rx="4.8" ry="9" fill={p.accent} transform="rotate(-18 46.5 28)" />
        <ellipse cx="38" cy="25" rx="4.5" ry="3.6" fill={p.accent} opacity="0.35" />
        <ellipse cx="32" cy="35.5" rx="7" ry="5" fill={p.belly} />
        <Eyes p={p} y={29} />
        <ellipse cx="32" cy="33" rx="2.2" ry="1.6" fill={p.ink} />
        <path d="M32 34.5 v1.2 M29.5 36 q2.5 2 5 0" fill="none" stroke={p.ink} strokeWidth="1" strokeLinecap="round" />
        <path d="M31 37 q1 2.6 2 0 z" fill="#ff7b8e" />
        <Cheeks p={p} y={34} gap={11} />
        <Shade />
      </>
    ),
  }),
  fox: p => ({
    back: (
      <g className="pet-tail">
        <path d="M41 51 C55 52 58 38 52 30 C50 38 46 42 41 44 Z" fill={p.body} />
        <path d="M52 30 C55 34 55 38 54 41 C51 38 50 34 52 30 Z" fill={p.belly} />
      </g>
    ),
    feet: <Feet color={p.accent} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12" ry="10" fill={p.body} />
        <ellipse cx="32" cy="49.5" rx="6.5" ry="6" fill={p.belly} />
        <path d="M16 27 L17 8 L29 19 Z" fill={p.body} /><path d="M48 27 L47 8 L35 19 Z" fill={p.body} />
        <path d="M17 11 L17.4 8 L20.5 11.5 Z" fill={p.accent} /><path d="M47 11 L46.6 8 L43.5 11.5 Z" fill={p.accent} />
        <path d="M19 22 L19.5 13 L25.5 19 Z" fill={p.belly} opacity="0.85" /><path d="M45 22 L44.5 13 L38.5 19 Z" fill={p.belly} opacity="0.85" />
        <ellipse cx="32" cy="29" rx="16" ry="13" fill={p.body} />
        <path d="M16.5 30 Q24 30 32 40 Q40 30 47.5 30 Q46 41 32 42 Q18 41 16.5 30 Z" fill={p.belly} />
        <Eyes p={p} y={28.5} gap={7} />
        <ellipse cx="32" cy="34.6" rx="1.8" ry="1.3" fill={p.ink} />
        <Mouth p={p} y={36.4} />
        <Shade />
      </>
    ),
  }),
  bunny: p => ({
    back: <circle className="pet-tail" cx="44" cy="51" r="4" fill={p.belly} />,
    feet: <Feet color={p.body} gap={6.5} />,
    body: (
      <>
        <ellipse cx="32" cy="47.5" rx="12" ry="9.5" fill={p.body} />
        <ellipse cx="32" cy="49.5" rx="7" ry="6" fill={p.belly} />
        <g className="pet-ear-l"><ellipse cx="25" cy="13" rx="4.4" ry="10" fill={p.body} transform="rotate(-10 25 18)" /><ellipse cx="25" cy="13.5" rx="2.1" ry="7" fill={p.accent} transform="rotate(-10 25 18)" /></g>
        <g className="pet-ear-r"><ellipse cx="39" cy="13" rx="4.4" ry="10" fill={p.body} transform="rotate(12 39 18)" /><ellipse cx="39" cy="13.5" rx="2.1" ry="7" fill={p.accent} transform="rotate(12 39 18)" /></g>
        <ellipse cx="32" cy="30" rx="14.5" ry="12.5" fill={p.body} />
        <Eyes p={p} y={29.5} />
        <path d="M30.8 33.3 h2.4 l-1.2 1.3 z" fill={p.accent} />
        <Mouth p={p} y={35} />
        <Cheeks p={p} y={34} gap={9.5} />
        <Shade />
      </>
    ),
  }),
  frog: p => ({
    feet: <Feet color={p.accent} gap={8} />,
    body: (
      <>
        <ellipse cx="32" cy="46" rx="15" ry="11.5" fill={p.body} />
        <ellipse cx="32" cy="49" rx="10" ry="7.5" fill={p.belly} />
        <ellipse cx="32" cy="32" rx="18" ry="11" fill={p.body} />
        <circle cx="23" cy="23.5" r="6.5" fill={p.body} /><circle cx="41" cy="23.5" r="6.5" fill={p.body} />
        <circle cx="23" cy="23.5" r="4.6" fill="#fff" opacity={p.fx ? 0.15 : 1} /><circle cx="41" cy="23.5" r="4.6" fill="#fff" opacity={p.fx ? 0.15 : 1} />
        <Eyes p={p} y={23.8} gap={9} />
        <path d="M22 34.5 Q32 41 42 34.5" fill="none" stroke={p.ink} strokeWidth="1.3" strokeLinecap="round" />
        <Cheeks p={p} y={34.5} gap={13} />
        <circle cx="29" cy="30" r="0.7" fill={p.ink} opacity="0.6" /><circle cx="35" cy="30" r="0.7" fill={p.ink} opacity="0.6" />
        <path d="M18 44 q-3 4 0 7 M46 44 q3 4 0 7" fill="none" stroke={p.accent} strokeWidth="3" strokeLinecap="round" />
        <Shade cy={51} rx={14} />
      </>
    ),
  }),
  owl: p => ({
    feet: <Feet color={p.accent} gap={5} y={58} />,
    body: (
      <>
        <path d="M18 18 L21 9 L27 15 Z M46 18 L43 9 L37 15 Z" fill={p.body} />
        <path d="M32 12 C47 12 50 26 49 38 C48 51 41 57 32 57 C23 57 16 51 15 38 C14 26 17 12 32 12 Z" fill={p.body} />
        <ellipse cx="32" cy="44" rx="10.5" ry="11" fill={p.belly} />
        <path d="M26 41 q1.5 1.5 3 0 M35 41 q1.5 1.5 3 0 M30.5 47 q1.5 1.5 3 0 M26 52 q1.5 1.5 3 0 M35 52 q1.5 1.5 3 0" fill="none" stroke={p.accent} strokeWidth="1" opacity="0.6" strokeLinecap="round" />
        <g className="pet-wing-l"><ellipse cx="16.5" cy="40" rx="4" ry="9" fill={p.accent} opacity="0.55" transform="rotate(12 16.5 40)" /></g>
        <g className="pet-wing-r"><ellipse cx="47.5" cy="40" rx="4" ry="9" fill={p.accent} opacity="0.55" transform="rotate(-12 47.5 40)" /></g>
        <circle cx="25" cy="26" r="7" fill={p.belly} /><circle cx="39" cy="26" r="7" fill={p.belly} />
        <Eyes p={p} y={26} gap={7} size={1.25} />
        <path d="M30 30.5 L34 30.5 L32 34.5 Z" fill={p.accent} />
      </>
    ),
  }),
  penguin: p => ({
    feet: <Feet color={p.accent} gap={5.5} y={58} />,
    body: (
      <>
        <path d="M32 11 C45 11 49 25 49 37 C49 50 42 57 32 57 C22 57 15 50 15 37 C15 25 19 11 32 11 Z" fill={p.body} />
        <g className="pet-wing-l"><path d="M16 33 Q8 42 13 48 Q16 42 18 39 Z" fill={p.body} /></g>
        <g className="pet-wing-r"><path d="M48 33 Q56 42 51 48 Q48 42 46 39 Z" fill={p.body} /></g>
        <path d="M32 21 C40 21 44 27 44 31 C46 38 44 54 32 54 C20 54 18 38 20 31 C20 27 24 21 32 21 Z" fill={p.belly} />
        <Eyes p={{ ...p, ink: p.fx === "galaxy" ? "#ffffff" : p.ink === "#2b2320" ? "#222" : p.ink }} y={28} gap={6} />
        <path d="M29 32 L35 32 L32 35.5 Z" fill={p.accent} />
        <Cheeks p={p} y={33} gap={9} />
      </>
    ),
  }),
  axolotl: p => ({
    back: <path className="pet-tail" d="M42 49 Q54 48 56 40 Q50 44 43 44 Z" fill={p.body} />,
    feet: <Feet color={p.body} gap={7.5} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="13" ry="9.5" fill={p.body} />
        <ellipse cx="32" cy="49.5" rx="8" ry="5.5" fill={p.belly} />
        {[-1, 1].map(s => (
          <g key={s} className={s < 0 ? "pet-ear-l" : "pet-ear-r"}>
            {[-6, 0, 6].map(dy => (
              <path key={dy} d={`M${32 + s * 15} ${30 + dy} q${s * 7} ${-3 + dy * 0.4} ${s * 10} ${-1 + dy * 0.6}`} fill="none" stroke={p.accent} strokeWidth="3" strokeLinecap="round" />
            ))}
          </g>
        ))}
        <ellipse cx="32" cy="31" rx="17" ry="12" fill={p.body} />
        <Eyes p={p} y={30} gap={8.5} size={0.9} />
        <path d="M27.5 35 Q32 38.5 36.5 35" fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
        <Cheeks p={p} y={34.5} gap={12} />
        <Shade />
      </>
    ),
  }),
  panda: p => ({
    feet: <Feet color={p.accent} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="13" ry="10.5" fill={p.body} />
        <path d="M19.5 41 Q32 46 44.5 41 Q46 46 44 48 Q32 53 20 48 Q18 46 19.5 41 Z" fill={p.accent} />
        <ellipse cx="32" cy="50.5" rx="6.5" ry="5" fill={p.belly} />
        <circle cx="19" cy="18.5" r="5.5" fill={p.accent} /><circle cx="45" cy="18.5" r="5.5" fill={p.accent} />
        <ellipse cx="32" cy="29.5" rx="16" ry="13.5" fill={p.body} />
        <ellipse cx="25" cy="29.5" rx="4.3" ry="5.3" fill={p.accent} transform="rotate(25 25 29.5)" />
        <ellipse cx="39" cy="29.5" rx="4.3" ry="5.3" fill={p.accent} transform="rotate(-25 39 29.5)" />
        <Eyes p={{ ...p, ink: "#ffffff", shine: p.accent }} y={29.5} gap={6.5} size={0.75} />
        <ellipse cx="32" cy="35" rx="2" ry="1.4" fill={p.accent} />
        <Mouth p={{ ...p, ink: p.accent }} y={36.6} />
        <Cheeks p={p} y={36} gap={11} />
        <Shade />
      </>
    ),
  }),
  bear: p => ({
    feet: <Feet color={p.accent} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="13.5" ry="10.5" fill={p.body} />
        <ellipse cx="32" cy="49" rx="8" ry="6.5" fill={p.belly} />
        <circle cx="19.5" cy="18" r="5.5" fill={p.body} /><circle cx="44.5" cy="18" r="5.5" fill={p.body} />
        <circle cx="19.5" cy="18" r="3" fill={p.belly} /><circle cx="44.5" cy="18" r="3" fill={p.belly} />
        <ellipse cx="32" cy="29.5" rx="16" ry="13.5" fill={p.body} />
        <ellipse cx="32" cy="35" rx="6.5" ry="4.6" fill={p.belly} />
        <Eyes p={p} y={28.5} gap={7} size={0.9} />
        <ellipse cx="32" cy="33.3" rx="2.3" ry="1.6" fill={p.ink} />
        <Mouth p={p} y={35.4} />
        <Cheeks p={p} y={34} gap={11} />
        <Shade />
      </>
    ),
  }),
  duck: p => ({
    back: <path className="pet-tail" d="M43 44 Q50 40 50 35 Q46 40 42 40 Z" fill={p.body} />,
    feet: <Feet color={p.accent} gap={5.5} />,
    body: (
      <>
        <ellipse cx="33" cy="46" rx="14" ry="10.5" fill={p.body} />
        <ellipse cx="31" cy="49" rx="8" ry="6" fill={p.belly} />
        <g className="pet-wing-r"><ellipse cx="41" cy="45" rx="6" ry="4.5" fill={p.body} transform="rotate(-20 41 45)" /><path d="M37 45 q4 2 8 -1" fill="none" stroke="#000" opacity="0.12" strokeWidth="1" /></g>
        <ellipse cx="30" cy="27" rx="13" ry="12" fill={p.body} />
        <path d="M29 15 q1 -5 4 -4 q-1 2 -1 4" fill={p.body} />
        <Eyes p={p} y={26} gap={5.5} cx={29} size={0.9} />
        <path d="M23.5 32 Q30 29 36.5 32 Q30 36.5 23.5 32 Z" fill={p.accent} />
        <path d="M24.5 32 Q30 33.6 35.5 32" fill="none" stroke="#000" opacity="0.18" strokeWidth="0.8" />
        <Cheeks p={p} y={31} gap={10} />
      </>
    ),
  }),
  slime: p => ({
    body: (
      <g className="pet-squish">
        <path d="M32 14 C40 22 52 30 52 44 C52 53 44 58 32 58 C20 58 12 53 12 44 C12 30 24 22 32 14 Z" fill={p.body} opacity={p.fx ? 1 : 0.92} />
        <path d="M20 44 C20 36 25 30 30 26" fill="none" stroke={p.belly} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <circle cx="22" cy="49" r="1.8" fill={p.belly} opacity="0.8" />
        <ellipse cx="32" cy="55.5" rx="15" ry="3" fill={p.accent} opacity="0.35" />
        <Eyes p={p} y={41} gap={6} />
        <Mouth p={p} y={45.5} />
        <Cheeks p={p} y={45} gap={10} />
      </g>
    ),
  }),
  ghost: p => ({
    body: (
      <g className="pet-float">
        <path d="M32 10 C45 10 50 21 50 33 L50 52 Q47 48 44 52 Q41 56 38 52 Q35 48 32 52 Q29 56 26 52 Q23 48 20 52 Q17 56 14 52 L14 33 C14 21 19 10 32 10 Z" fill={p.body} opacity="0.95" />
        <path d="M20 22 C22 16 27 14 31 14" fill="none" stroke={p.belly} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        <g className="pet-wing-l"><ellipse cx="13" cy="37" rx="3" ry="5.5" fill={p.body} transform="rotate(30 13 37)" /></g>
        <g className="pet-wing-r"><ellipse cx="51" cy="37" rx="3" ry="5.5" fill={p.body} transform="rotate(-30 51 37)" /></g>
        <Eyes p={p} y={30} gap={6.5} />
        <ellipse cx="32" cy="36.5" rx="2.2" ry="2.8" fill={p.ink} opacity="0.85" />
        <Cheeks p={{ ...p, cheek: p.accent }} y={34} gap={10.5} />
      </g>
    ),
  }),
  robot: p => ({
    feet: (
      <g className="pet-feet">
        <rect className="pet-foot pet-foot-l" x="22" y="53" width="7" height="5" rx="1.5" fill={p.accent === "#4fd1ff" ? "#7e8a98" : p.accent} />
        <rect className="pet-foot pet-foot-r" x="35" y="53" width="7" height="5" rx="1.5" fill={p.accent === "#4fd1ff" ? "#7e8a98" : p.accent} />
      </g>
    ),
    body: (
      <>
        <path d="M32 12 V6" stroke={p.body} strokeWidth="1.6" />
        <circle className="pet-antenna" cx="32" cy="5" r="2.3" fill={p.accent} />
        <rect x="20" y="39" width="24" height="16" rx="5" fill={p.body} />
        <rect x="26" y="43" width="12" height="8" rx="2" fill={p.belly} />
        <circle cx="29.5" cy="47" r="1.3" fill={p.accent} /><circle cx="34.5" cy="47" r="1.3" fill="#ff6b8a" />
        <g className="pet-wing-l"><rect x="14" y="41" width="6" height="10" rx="3" fill={p.body} /></g>
        <g className="pet-wing-r"><rect x="44" y="41" width="6" height="10" rx="3" fill={p.body} /></g>
        <rect x="14" y="12" width="36" height="28" rx="9" fill={p.body} />
        <rect x="18" y="16" width="28" height="19" rx="6" fill="#1d2430" />
        <g className="pet-eyes">
          <rect x="23" y="21.5" width="5" height="6.5" rx="2.5" fill={p.accent} />
          <rect x="36" y="21.5" width="5" height="6.5" rx="2.5" fill={p.accent} />
        </g>
        <path d="M29 31 q3 2 6 0" fill="none" stroke={p.accent} strokeWidth="1.2" strokeLinecap="round" />
        <rect x="11" y="22" width="3" height="8" rx="1.5" fill={p.belly} /><rect x="50" y="22" width="3" height="8" rx="1.5" fill={p.belly} />
      </>
    ),
  }),
  dragon: p => ({
    back: (
      <>
        <path className="pet-tail" d="M42 51 C52 53 56 47 55 41 L58 38 L53 37 L52 41 C52 45 48 47 42 46 Z" fill={p.body} />
        <g className="pet-wing-l"><path d="M20 41 L8 30 L10 38 L6 40 L13 45 Z" fill={p.accent} opacity="0.9" /></g>
        <g className="pet-wing-r"><path d="M44 41 L56 30 L54 38 L58 40 L51 45 Z" fill={p.accent} opacity="0.9" /></g>
      </>
    ),
    feet: <Feet color={p.body} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12.5" ry="10" fill={p.body} />
        <path d="M32 40 C37 40 39 45 39 49 C39 54 36 56 32 56 C28 56 25 54 25 49 C25 45 27 40 32 40 Z" fill={p.belly} />
        <path d="M28 43.5 h8 M27 47.5 h10 M27.5 51.5 h9" stroke={p.accent} strokeWidth="0.8" opacity="0.4" />
        <path d="M21 20 L18 9 L26 16 Z M43 20 L46 9 L38 16 Z" fill={p.accent} />
        <ellipse cx="32" cy="29" rx="15.5" ry="13" fill={p.body} />
        <path d="M28 16.5 l2 -3 l2 3 l2 -3 l2 3" fill={p.accent} />
        <ellipse cx="32" cy="35" rx="7.5" ry="4.8" fill={p.belly} />
        <circle cx="29.6" cy="34" r="0.8" fill={p.ink} /><circle cx="34.4" cy="34" r="0.8" fill={p.ink} />
        <Eyes p={p} y={28} gap={7} />
        <path d="M29.5 37 q2.5 1.6 5 0" fill="none" stroke={p.ink} strokeWidth="1" strokeLinecap="round" />
        <Cheeks p={p} y={33} gap={11.5} />
        <Shade />
      </>
    ),
  }),
  octopus: p => ({
    body: (
      <>
        <g className="pet-tentacles">
          {[-12, -6, 0, 6, 12].map((dx, i) => (
            <path key={dx} className={`pet-tentacle pet-tentacle-${i % 2}`}
              d={`M${32 + dx} 42 q${dx * 0.25} 8 ${dx * 0.4 + (i % 2 ? 4 : -4)} 13 q${i % 2 ? -3 : 3} 2 ${i % 2 ? -5 : 5} -1`}
              fill="none" stroke={p.body} strokeWidth="5" strokeLinecap="round" />
          ))}
        </g>
        <path d="M32 9 C46 9 50 21 50 31 C50 41 43 46 32 46 C21 46 14 41 14 31 C14 21 18 9 32 9 Z" fill={p.body} />
        <circle cx="23" cy="18" r="2" fill={p.belly} opacity="0.7" /><circle cx="42" cy="15.5" r="1.5" fill={p.belly} opacity="0.7" /><circle cx="44" cy="22" r="2.4" fill={p.belly} opacity="0.7" />
        <Eyes p={p} y={31} gap={6.5} />
        <Mouth p={p} y={36} />
        <Cheeks p={p} y={36} gap={10.5} />
      </>
    ),
  }),
  unicorn: p => ({
    back: <path className="pet-tail" d="M42 50 C52 52 56 44 52 36 C50 42 46 45 42 45 Z" fill={p.accent} />,
    feet: <Feet color={p.accent} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12.5" ry="10" fill={p.body} />
        <ellipse cx="32" cy="49" rx="7.5" ry="6.5" fill={p.belly} />
        <path d="M20 22 L18 13 L26 18 Z M44 22 L46 13 L38 18 Z" fill={p.body} />
        <ellipse cx="32" cy="29" rx="15" ry="13" fill={p.body} />
        <path d="M32 6 L35 18 L29 18 Z" fill="#ffd45c" />
        <path d="M30 9.5 L34 11 M29.6 13 L34.6 14.6" stroke="#e8a92a" strokeWidth="0.9" />
        <path d="M21 19 C24 13 30 14 33 18 C29 18 26 21 25 25 C24 22 22 21 21 19 Z" fill={p.accent} />
        <path d="M18 24 C14 30 16 37 19 40 C19 34 20 30 22 27 Z" fill={p.accent} opacity="0.9" />
        <ellipse cx="32" cy="35.5" rx="7.5" ry="5" fill={p.belly} />
        <circle cx="29.5" cy="35" r="0.8" fill={p.ink} opacity="0.6" /><circle cx="34.5" cy="35" r="0.8" fill={p.ink} opacity="0.6" />
        <Eyes p={p} y={28} gap={7} />
        <path d="M29.5 37.8 q2.5 1.6 5 0" fill="none" stroke={p.ink} strokeWidth="1" strokeLinecap="round" />
        <Cheeks p={p} y={33} gap={11} />
        <Shade />
      </>
    ),
  }),
  capybara: p => ({
    feet: <Feet color={p.accent} gap={8} />,
    body: (
      <>
        <rect x="14" y="36" width="36" height="20" rx="10" fill={p.body} />
        <rect x="15" y="16" width="34" height="27" rx="13" fill={p.body} />
        <ellipse cx="19" cy="18" rx="3" ry="2.4" fill={p.accent} /><ellipse cx="45" cy="18" rx="3" ry="2.4" fill={p.accent} />
        <rect x="21" y="29" width="22" height="13" rx="6.5" fill={p.accent} opacity="0.55" />
        <ellipse cx="28.5" cy="32.5" rx="1.2" ry="1.6" fill={p.ink} /><ellipse cx="35.5" cy="32.5" rx="1.2" ry="1.6" fill={p.ink} />
        <path d="M30 37.5 q2 1.4 4 0" fill="none" stroke={p.ink} strokeWidth="1" strokeLinecap="round" />
        <g className="pet-eyes">
          <path d="M20 25 q3 2 6 0" fill="none" stroke={p.ink} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M38 25 q3 2 6 0" fill="none" stroke={p.ink} strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <circle cx="32" cy="12" r="5" fill="#ff9a2e" />
        <path d="M32 7 q2 -3 5 -2 q-2 3 -5 2 Z" fill="#5fb84a" />
        <Shade cy={52} rx={16} ry={5} />
      </>
    ),
  }),
  hamster: p => ({
    feet: <Feet color={p.cheek} gap={6} y={58} />,
    body: (
      <>
        <circle cx="21" cy="19" r="4.5" fill={p.body} /><circle cx="43" cy="19" r="4.5" fill={p.body} />
        <circle cx="21" cy="19" r="2.4" fill={p.cheek} opacity="0.7" /><circle cx="43" cy="19" r="2.4" fill={p.cheek} opacity="0.7" />
        <path d="M32 15 C47 15 52 28 52 40 C52 52 43 57 32 57 C21 57 12 52 12 40 C12 28 17 15 32 15 Z" fill={p.body} />
        <path d="M32 31 C42 31 47 38 47 45 C47 52 40 56 32 56 C24 56 17 52 17 45 C17 38 22 31 32 31 Z" fill={p.belly} />
        <ellipse cx="18" cy="37" rx="6" ry="5" fill={p.belly} /><ellipse cx="46" cy="37" rx="6" ry="5" fill={p.belly} />
        <Eyes p={p} y={29} gap={7} size={0.85} />
        <path d="M31 33.4 h2 l-1 1.1 z" fill={p.cheek} />
        <Mouth p={p} y={35} />
        <Cheeks p={p} y={37} gap={13} />
        <ellipse cx="27" cy="46" rx="2.6" ry="2" fill={p.cheek} opacity="0.7" /><ellipse cx="37" cy="46" rx="2.6" ry="2" fill={p.cheek} opacity="0.7" />
      </>
    ),
  }),
  shark: p => ({
    back: <path className="pet-tail" d="M43 50 L56 44 L53 51 L57 57 Z" fill={p.body} />,
    feet: <Feet color={p.body} gap={7} />,
    body: (
      <>
        <path d="M32 4 L39 18 L26 18 Z" fill={p.body} />
        <path d="M32 13 C46 13 50 25 50 37 C50 50 42 56 32 56 C22 56 14 50 14 37 C14 25 18 13 32 13 Z" fill={p.body} />
        <path d="M18 36 Q32 30 46 36 C46 48 40 54 32 54 C24 54 18 48 18 36 Z" fill={p.belly} />
        <g className="pet-wing-l"><path d="M15 38 L6 46 L16 45 Z" fill={p.body} /></g>
        <g className="pet-wing-r"><path d="M49 38 L58 46 L48 45 Z" fill={p.body} /></g>
        <path d="M19 26 l2 1.2 M45 26 l-2 1.2 M19 29 l2 0.8 M45 29 l-2 0.8" stroke={p.accent} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <Eyes p={p} y={26} gap={8} size={0.95} />
        <path d="M24 35.5 Q32 41 40 35.5" fill="#fff" stroke={p.ink} strokeWidth="1" strokeLinejoin="round" />
        <path d="M26 36.4 l1.4 2 l1.4 -1.6 l1.4 2 l1.4 -1.8 l1.4 1.8 l1.4 -1.8 l1.4 2 l1.4 -1.6 l1.4 1.8" fill="none" stroke={p.ink} strokeWidth="0.6" opacity="0.5" />
        <Cheeks p={p} y={32} gap={12} />
      </>
    ),
  }),
  dino: p => ({
    back: <path className="pet-tail" d="M42 52 C52 54 58 50 60 44 C54 47 48 46 42 45 Z" fill={p.body} />,
    feet: <Feet color={p.body} gap={6.5} />,
    body: (
      <>
        {[14, 20, 26].map((y, i) => <path key={y} d={`M${44 + i * 2} ${y + 6} l5 -3 l-1 6 Z`} fill={p.accent} />)}
        <ellipse cx="32" cy="47" rx="12" ry="10" fill={p.body} />
        <ellipse cx="32" cy="49.5" rx="7" ry="6" fill={p.belly} />
        <path d="M32 11 C45 11 50 18 50 26 C50 34 45 38 36 38 L24 38 C17 38 14 33 14 26 C14 18 19 11 32 11 Z" fill={p.body} />
        <path d="M17 31 Q32 36 48 30 Q46 38 36 38.5 L24 38.5 Q17 38 17 31 Z" fill={p.belly} />
        <path d="M21 33 l1.5 2 l1.5 -2 l1.5 2 l1.5 -2 M38 33 l1.5 2 l1.5 -2 l1.5 2 l1.5 -2" fill="none" stroke="#fff" strokeWidth="1" />
        <path d="M21 31.5 Q32 33.5 44 31" fill="none" stroke={p.ink} strokeWidth="1.1" strokeLinecap="round" />
        <Eyes p={p} y={22} gap={8} />
        <circle cx="45" cy="26" r="0.8" fill={p.ink} opacity="0.6" /><circle cx="47" cy="25" r="0.8" fill={p.ink} opacity="0.6" />
        <g className="pet-wing-l"><path d="M22 43 q-4 1 -4 4" fill="none" stroke={p.body} strokeWidth="2.6" strokeLinecap="round" /></g>
        <g className="pet-wing-r"><path d="M42 43 q4 1 4 4" fill="none" stroke={p.body} strokeWidth="2.6" strokeLinecap="round" /></g>
        <Shade />
      </>
    ),
  }),
  phoenix: p => ({
    back: (
      <g className="pet-tail">
        <path d="M38 50 C50 54 56 48 58 40 C54 44 50 44 47 43 C52 40 54 35 53 30 C49 36 45 39 40 42 Z" fill={p.accent} />
        <path d="M40 48 C48 50 52 46 54 42 C50 44 46 44 43 44 Z" fill="#ffd45c" opacity="0.9" />
      </g>
    ),
    feet: <Feet color="#ffb020" gap={5} y={58} />,
    body: (
      <>
        <g className="pet-wing-l"><path d="M18 38 C8 34 4 26 6 20 C10 26 14 28 19 30 Z" fill={p.accent} /></g>
        <g className="pet-wing-r"><path d="M46 38 C56 34 60 26 58 20 C54 26 50 28 45 30 Z" fill={p.accent} /></g>
        <ellipse cx="32" cy="44" rx="12" ry="12" fill={p.body} />
        <ellipse cx="32" cy="47" rx="7" ry="7.5" fill={p.belly} />
        <path className="pet-flame" d="M32 4 C35 9 38 11 36 16 C40 14 41 10 40 8 C44 13 42 19 38 21 L26 21 C22 19 20 13 24 8 C24 11 26 14 28 15 C27 11 29 7 32 4 Z" fill={p.accent} />
        <path d="M32 9 C34 12 35 14 34 17 L30 17 C29 14 30 12 32 9 Z" fill="#ffd45c" />
        <circle cx="32" cy="29" r="12" fill={p.body} />
        <Eyes p={p} y={28} gap={5.5} />
        <path d="M29.5 32 L34.5 32 L32 36 Z" fill="#ffb020" />
        <Cheeks p={p} y={32} gap={8.5} />
      </>
    ),
  }),
  mushroom: p => ({
    feet: <Feet color={p.belly} gap={5} />,
    body: (
      <>
        <path d="M24 34 C24 30 40 30 40 34 L41 50 C41 55 23 55 23 50 Z" fill={p.belly} />
        <Eyes p={p} y={41} gap={5} size={0.85} />
        <Mouth p={p} y={45} />
        <Cheeks p={p} y={45} gap={8.5} />
        <path d="M8 32 C8 16 20 9 32 9 C44 9 56 16 56 32 C56 36 52 37 48 35 C40 32 24 32 16 35 C12 37 8 36 8 32 Z" fill={p.body} />
        <circle cx="22" cy="20" r="4" fill={p.belly} opacity="0.95" /><circle cx="38" cy="16" r="3" fill={p.belly} opacity="0.95" />
        <circle cx="46" cy="26" r="3.6" fill={p.belly} opacity="0.95" /><circle cx="31" cy="27" r="2.2" fill={p.belly} opacity="0.95" />
        <circle cx="14" cy="29" r="2" fill={p.belly} opacity="0.95" />
      </>
    ),
  }),
  alien: p => ({
    feet: <Feet color={p.body} gap={5} />,
    body: (
      <>
        <path d="M24 14 Q20 6 16 6 M40 14 Q44 6 48 6" fill="none" stroke={p.body} strokeWidth="1.5" />
        <circle className="pet-antenna" cx="16" cy="6" r="2.4" fill={p.accent} /><circle className="pet-antenna" cx="48" cy="6" r="2.4" fill={p.accent} />
        <path d="M26 40 h12 l2 14 h-16 Z" fill={p.body} />
        <g className="pet-wing-l"><path d="M26 42 q-6 3 -7 8" fill="none" stroke={p.body} strokeWidth="2.6" strokeLinecap="round" /></g>
        <g className="pet-wing-r"><path d="M38 42 q6 3 7 8" fill="none" stroke={p.body} strokeWidth="2.6" strokeLinecap="round" /></g>
        <path d="M32 11 C46 11 52 20 52 28 C52 36 42 43 32 43 C22 43 12 36 12 28 C12 20 18 11 32 11 Z" fill={p.body} />
        <g className="pet-eyes">
          <ellipse cx="23.5" cy="28" rx="5.5" ry="7" fill="#15121c" transform="rotate(-25 23.5 28)" />
          <ellipse cx="40.5" cy="28" rx="5.5" ry="7" fill="#15121c" transform="rotate(25 40.5 28)" />
          <circle cx="25" cy="25" r="1.8" fill="#fff" /><circle cx="42" cy="25" r="1.8" fill="#fff" />
        </g>
        <path d="M30 37 q2 1.2 4 0" fill="none" stroke={p.ink} strokeWidth="1" strokeLinecap="round" />
        <circle cx="32" cy="48" r="2" fill={p.accent} />
      </>
    ),
  }),
  astronaut: p => ({
    feet: (
      <g className="pet-feet">
        <rect className="pet-foot pet-foot-l" x="21" y="53" width="9" height="5.5" rx="2.5" fill="#d7dbe2" />
        <rect className="pet-foot pet-foot-r" x="34" y="53" width="9" height="5.5" rx="2.5" fill="#d7dbe2" />
      </g>
    ),
    body: (
      <>
        <rect x="44" y="36" width="8" height="14" rx="3" fill="#cfd5de" />
        <rect x="18" y="37" width="28" height="19" rx="8" fill={p.body} />
        <rect x="27" y="42" width="10" height="7" rx="2" fill={p.belly} />
        <circle cx="30" cy="45.5" r="1.2" fill={p.accent} /><circle cx="34" cy="45.5" r="1.2" fill="#ff6b6b" />
        <g className="pet-wing-l"><rect x="12" y="39" width="7" height="12" rx="3.5" fill={p.body} /></g>
        <g className="pet-wing-r"><rect x="45" y="39" width="7" height="12" rx="3.5" fill={p.body} /></g>
        <circle cx="32" cy="24" r="16" fill={p.body} />
        <circle cx="32" cy="25" r="12" fill="#1b2a44" />
        <circle cx="32" cy="26" r="9.5" fill="#ffd9b8" />
        <Eyes p={{ ...p, ink: "#2b2320", shine: "#fff" }} y={25.5} gap={4.2} size={0.75} />
        <path d="M30.5 29.5 q1.5 1 3 0" fill="none" stroke="#2b2320" strokeWidth="0.9" strokeLinecap="round" />
        <ellipse cx="26.5" cy="28.5" rx="1.8" ry="1.1" fill="#ff8fa3" opacity="0.5" /><ellipse cx="37.5" cy="28.5" rx="1.8" ry="1.1" fill="#ff8fa3" opacity="0.5" />
        <path d="M23 18 C25 15 28 14 31 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <rect x="14.5" y="21" width="3" height="8" rx="1.5" fill={p.accent} /><rect x="46.5" y="21" width="3" height="8" rx="1.5" fill={p.accent} />
      </>
    ),
  }),
  wizard: p => ({
    feet: <Feet color={p.accent} gap={6} />,
    body: (
      <>
        <path d="M18 56 C18 44 22 36 32 36 C42 36 46 44 46 56 Z" fill={p.body} />
        <path d="M27 36 L32 56 L37 36 Z" fill="#000" opacity="0.08" />
        <g className="pet-wing-r">
          <path d="M46 46 L53 30" stroke="#8b5a2b" strokeWidth="2" strokeLinecap="round" />
          <circle className="pet-antenna" cx="53.5" cy="29" r="3" fill="#7fe3ff" />
        </g>
        <circle cx="32" cy="29" r="10" fill="#ffd9b8" />
        <path d="M22 30 C22 44 28 50 32 50 C36 50 42 44 42 30 C38 34 26 34 22 30 Z" fill={p.belly} />
        <path d="M27.5 36 q4.5 -2 9 0" fill={p.belly} stroke="#00000022" strokeWidth="0.6" />
        <Eyes p={{ ...p, ink: "#2b2320", shine: "#fff" }} y={29} gap={4.6} size={0.8} />
        <path d="M14 24 L46 24 C44 20 40 19 38 19 L33 2 C31 6 27 12 25 19 C22 19 18 20 14 24 Z" fill={p.accent} />
        <path d="M24 21.5 h17" stroke="#ffd45c" strokeWidth="2.2" />
        <path d="M30 11 l0.8 1.6 l1.7 0.2 l-1.3 1.1 l0.4 1.7 l-1.6 -0.9 l-1.6 0.9 l0.4 -1.7 l-1.3 -1.1 l1.7 -0.2 Z" fill="#ffd45c" />
        <circle cx="36" cy="16" r="0.9" fill="#ffd45c" /><circle cx="27" cy="18" r="0.7" fill="#ffd45c" />
      </>
    ),
  }),
  ninja: p => ({
    back: (
      <g className="pet-tail">
        <path d="M44 22 C50 22 54 18 57 14 M44 24 C50 26 55 26 59 24" fill="none" stroke={p.accent} strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ),
    feet: <Feet color={p.body} />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12" ry="10" fill={p.body} />
        <path d="M22 42 L42 50" stroke={p.accent} strokeWidth="3" opacity="0.9" />
        <g className="pet-wing-l"><ellipse cx="20" cy="46" rx="3.5" ry="5" fill={p.body} /></g>
        <g className="pet-wing-r"><ellipse cx="44" cy="46" rx="3.5" ry="5" fill={p.body} /></g>
        <circle cx="32" cy="27" r="15" fill={p.body} />
        <rect x="18" y="22.5" width="28" height="9" rx="4.5" fill="#ffd9b8" />
        <rect x="17" y="17" width="30" height="4" rx="2" fill={p.accent} />
        <circle cx="32" cy="19" r="2.4" fill="#d7dbe2" /><circle cx="32" cy="19" r="1" fill={p.accent} />
        <g className="pet-eyes">
          <path d="M23 27.5 q2.5 -2.6 5.4 0 q-2.7 1.6 -5.4 0 Z" fill="#2b2320" />
          <path d="M35.6 27.5 q2.7 -2.6 5.4 0 q-2.7 1.6 -5.4 0 Z" fill="#2b2320" />
        </g>
        <path d="M22.5 24.5 l5 1.4 M41.5 24.5 l-5 1.4" stroke="#2b2320" strokeWidth="1" strokeLinecap="round" />
        <Shade />
      </>
    ),
  }),
  pirate: p => ({
    feet: <Feet color="#3a2a22" />,
    body: (
      <>
        <ellipse cx="32" cy="47" rx="12.5" ry="10" fill="#fff" />
        {[41, 45, 49, 53].map(y => <path key={y} d={`M${21 + Math.abs(48 - y) * 0.6} ${y} h${22 - Math.abs(48 - y) * 1.2}`} stroke={p.accent} strokeWidth="2" />)}
        <g className="pet-wing-r">
          <path d="M44 46 L52 40" stroke="#c9ced6" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M43 47 l3 -3" stroke="#8b5a2b" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="32" cy="29" r="13.5" fill={p.belly} />
        <Eyes p={{ ...p, ink: "#2b2320", shine: "#fff" }} y={29.5} gap={5.5} cx={30} size={0.9} />
        <circle cx="36.5" cy="29.5" r="3.6" fill="#1e1e22" />
        <path d="M22 23 L45 33" stroke="#1e1e22" strokeWidth="1" />
        <path d="M27 35 q4 3 7 0" fill="none" stroke="#2b2320" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M26.5 37.5 q5.5 2.5 9 -1" fill="none" stroke="#6b3d22" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        <path d="M12 22 C16 14 24 13 32 16 C40 13 48 14 52 22 C46 20 40 21 32 22 C24 21 18 20 12 22 Z" fill={p.body} />
        <path d="M20 19 C22 9 42 9 44 19 Z" fill={p.body} />
        <circle cx="32" cy="15" r="2.6" fill="#fff" /><path d="M30.2 18 l3.6 -1.6 M30.2 16.4 l3.6 1.6" stroke="#fff" strokeWidth="0.8" />
        <ellipse cx="22" cy="33" rx="2.4" ry="1.5" fill="#ff8fa3" opacity="0.45" />
      </>
    ),
  }),
}

export const SPECIES_LIST = Object.keys(DRAW)

// A community pet's sheet: the row of what it does now, played frame by frame.
// Its rows: idle, running right, running left, waving, jumping, failed,
// waiting, running (at work), review.
export type Doing = "idle" | "walk" | "sleep" | "drag" | "cheer" | "alert" | "eat" | "work" | "wait" | "sad"
const ROWS: Record<Doing, [row: number, frames: number]> = {
  idle: [0, 6], walk: [1, 8], sleep: [6, 6], drag: [3, 4], cheer: [4, 5], alert: [3, 4], eat: [0, 6], work: [7, 6], wait: [6, 6], sad: [5, 8],
}
function SpritePet({ id, size, doing = "idle", facing = 1, className }: { id: string; size: number; doing?: Doing; facing?: number; className?: string }) {
  const meta = adoptedPets.get(id.slice(COMMUNITY.length))
  const [cw, ch] = meta?.cell ?? [192, 208]
  const [aw, ah] = meta?.atlas ?? [1536, 2288]
  const h = size * 1.3
  const w = (h * cw) / ch
  const k = h / ch
  let [row, frames] = ROWS[doing]
  if (doing === "walk" && facing < 0) row = 2
  return (
    <span className={cn("pet-sprite-box", className)} style={{ width: size, height: size }}>
      <i className={cn("pet-sprite", doing === "sleep" && "is-asleep")}
        style={{
          width: w, height: h, backgroundImage: `url(/api/pets/community/${encodeURIComponent(id.slice(COMMUNITY.length))}/sheet)`,
          backgroundSize: `${aw * k}px ${ah * k}px`, backgroundPositionY: -row * h,
          "--w": `${w}px`, "--frames": frames, animationDuration: `${frames * 0.13}s`, animationTimingFunction: `steps(${frames})`,
        } as React.CSSProperties} />
    </span>
  )
}

// One pet. `isLocked`: a pet you do not have yet, its shape only. A community
// pet plays the animation of what it does (`doing`, `facing`).
export function PetArt({ id, size = 64, className, isLocked = false, doing, facing }: { id: string; size?: number; className?: string; isLocked?: boolean; doing?: Doing; facing?: number }) {
  if (isCommunity(id)) return <SpritePet id={id} size={size} doing={doing} facing={facing} className={className} />
  return <DrawnPet id={id} size={size} className={className} isLocked={isLocked} />
}

function DrawnPet({ id, size, className, isLocked }: { id: string; size: number; className?: string; isLocked: boolean }) {
  const uid = useId().replace(/:/g, "")
  const [species = "cat", skin = "classic"] = id.split(":")
  const p = paintOf(species, skin, uid)
  const drawn = (DRAW[species] ?? DRAW.cat!)(p)
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden data-species={species}
      className={cn("pet-art overflow-visible", !isLocked && p.fx && `pet-fx-${p.fx}`, isLocked && "pet-locked", className)}>
      {p.defs && <defs>{p.defs}</defs>}
      <ellipse className="pet-shadow" cx="32" cy="60" rx="15" ry="2.6" fill="#000" opacity="0.16" />
      <g className="pet-bob">
        {drawn.back}
        {drawn.feet}
        {drawn.body}
      </g>
    </svg>
  )
}
