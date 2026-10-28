// The page a visual Claude drew (show_widget) runs in: a sandboxed frame with
// what the desktop app gives it (its CSS variables, the SVG classes `t`, `ts`,
// `th`, `box`, `node`, `arr`, `leader` and `c-{ramp}`, bare form controls
// styled, Tabler's icons, `sendPrompt` and `openLink`). The frame tells the
// page its height and what it asks, by message: `{ frame, height }`,
// `{ frame, prompt }`, `{ frame, link }`.

export type Mode = "light" | "dark"
// The board's own colours, read from the page (index.css), for the frame's.
export type Palette = { surface: string; side: string; bg: string; text: string; muted: string; faint: string; line: string; lineStrong: string; brand: string; work: string; bad: string; ask: string; review: string }

const RAMPS: Record<string, [string, string, string, string, string, string, string]> = {
  purple: ["#EEEDFE", "#CECBF6", "#AFA9EC", "#7F77DD", "#534AB7", "#3C3489", "#26215C"],
  teal: ["#E1F5EE", "#9FE1CB", "#5DCAA5", "#1D9E75", "#0F6E56", "#085041", "#04342C"],
  coral: ["#FAECE7", "#F5C4B3", "#F0997B", "#D85A30", "#993C1D", "#712B13", "#4A1B0C"],
  pink: ["#FBEAF0", "#F4C0D1", "#ED93B1", "#D4537E", "#993556", "#72243E", "#4B1528"],
  gray: ["#F1EFE8", "#D3D1C7", "#B4B2A9", "#888780", "#5F5E5A", "#444441", "#2C2C2A"],
  blue: ["#E6F1FB", "#B5D4F4", "#85B7EB", "#378ADD", "#185FA5", "#0C447C", "#042C53"],
  green: ["#EAF3DE", "#C0DD97", "#97C459", "#639922", "#3B6D11", "#27500A", "#173404"],
  amber: ["#FAEEDA", "#FAC775", "#EF9F27", "#BA7517", "#854F0B", "#633806", "#412402"],
  red: ["#FCEBEB", "#F7C1C1", "#F09595", "#E24B4A", "#A32D2D", "#791F1F", "#501313"],
}

// Each ramp's stops: 50, 100, 200, 400, 600, 800, 900. Light: 50 fill, 600
// stroke, 800 title, 600 subtitle; dark: 800 fill, 200 stroke, 100 title, 200 subtitle.
function rampCss(mode: Mode) {
  return Object.entries(RAMPS).map(([name, [s50, s100, s200, , s600, s800]]) => {
    const [fill, stroke, title, sub] = mode === "light" ? [s50, s600, s800, s600] : [s800, s200, s100, s200]
    const c = `.c-${name}`
    return `${c}>rect,${c}>circle,${c}>ellipse,${c}>polygon,rect${c},circle${c},ellipse${c}{fill:${fill};stroke:${stroke}}` +
      `${c}>.t,${c}>.th{fill:${title}}${c}>.ts{fill:${sub}}`
  }).join("\n")
}

const ICONS = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css"

function baseCss(p: Palette, mode: Mode) {
  const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
  return `:root{color-scheme:${mode};
--surface-0:${p.bg};--surface-1:${p.side};--surface-2:${p.surface};--surface-3:${p.surface};--page-bg:transparent;
--text-primary:${p.text};--text-secondary:${p.muted};--text-muted:${p.faint};--text-disabled:${p.faint};
--text-accent:${p.review};--text-danger:${p.bad};--text-success:${p.work};--text-warning:${p.ask};
--bg-accent:${mix(p.review, 14)};--bg-danger:${mix(p.bad, 14)};--bg-success:${mix(p.work, 14)};--bg-warning:${mix(p.ask, 16)};
--fill-accent:${p.review};--fill-danger:${p.bad};--fill-success:${p.work};--fill-warning:${p.ask};
--border:${p.line};--border-strong:${p.lineStrong};--border-stronger:${mix(p.text, 40)};
--border-accent:${p.review};--border-danger:${p.bad};--border-success:${p.work};--border-warning:${p.ask};
--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--font-voice:Georgia,"Times New Roman",serif;--font-mono:ui-monospace,"SF Mono",Menlo,monospace;
--radius:8px;--pad-sm:6px;--pad-md:10px;--pad-lg:14px;--pad-xl:20px;--gap-xs:4px;--gap-sm:8px;--gap-md:12px;--gap-lg:16px;--gap-xl:24px;
--p:var(--text-primary);--s:var(--text-secondary);--t:var(--text-muted);--bg2:var(--surface-1);--b:var(--border)}
html,body{margin:0;background:transparent}
body{font:16px/1.7 var(--font-sans);color:var(--text-primary);overflow:hidden}
h1,h2,h3{color:var(--text-primary);font-weight:500;margin:0 0 .5em}h1{font-size:22px}h2{font-size:18px}h3{font-size:16px}
svg{display:block;max-width:100%}
.t,.th{font:14px var(--font-sans);fill:var(--text-primary)}.th{font-weight:500}.ts{font:12px var(--font-sans);fill:var(--text-secondary)}
.box{fill:var(--surface-1);stroke:var(--border-strong)}
.node{cursor:pointer;transition:opacity .15s}.node:hover{opacity:.8}
.arr{stroke:var(--text-muted);stroke-width:1.5;fill:none}
.leader{stroke:var(--text-muted);stroke-width:.5;stroke-dasharray:3 3;fill:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
a{color:var(--text-accent)}
button{font:14px var(--font-sans);color:var(--text-primary);background:transparent;border:.5px solid var(--border-strong);border-radius:var(--radius);padding:6px 12px;cursor:pointer}
button:hover{background:var(--surface-1)}button:active{transform:scale(.98)}
input[type=text],input[type=number],input[type=email],input:not([type]),select,textarea{font:14px var(--font-sans);color:var(--text-primary);background:var(--surface-2);border:.5px solid var(--border-strong);border-radius:var(--radius);padding:0 10px;height:36px;box-sizing:border-box}
textarea{height:auto;padding:8px 10px}
input[type=range]{accent-color:var(--text-accent)}
${rampCss(mode)}`
}

// Runs in the frame: its height to the page (each change), and what it asks.
const bridge = (frame: string) => `<script>
(function(){var F=${JSON.stringify(frame)};var tell=function(m){m.frame=F;parent.postMessage(m,"*")};
window.sendPrompt=function(t){tell({prompt:String(t)})};window.openLink=function(u){tell({link:String(u)})};
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a&&/^https?:/.test(a.href)){e.preventDefault();openLink(a.href)}});
var last=0;var size=function(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h!==last){last=h;tell({height:h})}};
new ResizeObserver(size).observe(document.documentElement);addEventListener("load",size);size()})();
</script>`

export function frameDoc(html: string, { frame, mode, palette }: { frame: string; mode: Mode; palette: Palette }) {
  return `<!doctype html><html data-mode="${mode}"><head><meta charset="utf-8"><link rel="stylesheet" href="${ICONS}"><style>${baseCss(palette, mode)}</style>${bridge(frame)}</head><body>${html}</body></html>`
}

// The board's colours as the page has them now.
export function paletteNow(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(`--${name}`).trim()
  return {
    surface: v("surface"), side: v("side"), bg: v("bg"), text: v("text"), muted: v("text-muted"), faint: v("faint"),
    line: v("line"), lineStrong: v("line-strong"), brand: v("brand"), work: v("work"), bad: v("bad"), ask: v("ask"), review: v("review"),
  }
}
