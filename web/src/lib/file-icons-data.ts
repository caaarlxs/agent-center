// The icon theme's data, loaded on demand by file-icons.ts: its manifest, and
// each icon's URL by name (iconDefinitions names the SVG of each; the SVGs are
// files of their own, never inlined).
import manifest from "material-icon-theme/dist/material-icons.json"
import type { IconSet } from "./file-icons"

const files = import.meta.glob<string>("../../node_modules/material-icon-theme/icons/*.svg", { query: "?no-inline", import: "default", eager: true })
const byFile = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]))
const urls = Object.fromEntries(
  Object.entries(manifest.iconDefinitions as Record<string, { iconPath: string }>).flatMap(([name, def]) => {
    const url = byFile[def.iconPath.slice(def.iconPath.lastIndexOf("/") + 1)]
    return url ? [[name, url]] : []
  }),
)

export const ICON_SET: IconSet = { manifest: manifest as unknown as IconSet["manifest"], urls }
