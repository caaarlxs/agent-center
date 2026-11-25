// Findings a person adds in Staging or Prod (lib/findings.ts): what the view says of them.
import type { PersonFinding, Platform } from "@server/findings"

export const PLATFORM_NAMES: Record<Platform, string> = { web: "Web", ios: "iOS", android: "Android", backend: "Backend" }
export const platformsLine = (platforms: Platform[]) => platforms.map(p => PLATFORM_NAMES[p]).join(" · ")

// What Fix with build writes in Jira, said before the second click.
export function fixAsk(chosen: PersonFinding[]) {
  const stories = [...new Set(chosen.map(f => f.story))]
  return `Sure? ${chosen.length} [Fix] in Jira, ${stories.join(", ")} reopened`
}

// The links in what you typed or pasted: each web address once.
export const linksIn = (text: string) => [...new Set((text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map(l => l.replace(/[.,;:!?)]+$/, "")))]
// A link's name to show: a Figma node as "Figma", else its host and the start of its path.
export function linkName(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith("figma.com")) return `Figma${u.searchParams.get("node-id") ? ` · ${u.searchParams.get("node-id")}` : ""}`
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname.slice(0, 24) : ""}`
  } catch {
    return url
  }
}
