# Parity audit: shell, sidebar, panel, dialogs (classic `public/` vs new `web/src/`)

Scope: everything except the canvas, cards and board views. Paths: classic files are under `public/` (`js/…`, `styles.css`); new files are under `web/src/`. "css" means `public/styles.css`.
Classic colour tokens (dark, css:44-80) are quoted where they matter: `--bg #0c0c0e`, `--side #0f0f11`, `--surface #151518`, `--raised #1c1c20`, `--hover rgb(255 255 255/.04)`, `--press rgb(255 255 255/.07)`, `--text #ededf0`, `--muted #93939c`, `--faint #5f5f68`, `--line rgb(255 255 255/.07)`, `--line-strong rgb(255 255 255/.12)`, `--accent #e8825a`, `--accent-soft rgb(232 130 90/.14)`, `--ask #f5b544`, `--bad #f87171`, `--work #4ade80`, `--run #fb923c`, `--review #84a9ff`, `--select rgb(232 130 90/.1)`, `--shadow-pop 0 12px 40px rgb(0 0 0/.5), 0 0 0 1px rgb(255 255 255/.06)`, `--ease-out cubic-bezier(0.23,1,0.32,1)`.

Legend: missing = not in the new app; partial = present but differs (what differs in brackets); done = equivalent.

## App shell & header

- [x] Light theme + follows OS — classic: css:3-81 (light tokens `--bg #f6f5f2`, `--accent #c25a32`…; dark under `prefers-color-scheme: dark`), index.html:9-10 theme-color metas — new: missing (`web/index.html:2` hard-codes `class="dark"`; `index.css:51-118` stock shadcn neutral palette; `lib/monaco.ts:29` theme follows that class, so never light).
- [x] Colour tokens — classic: css:44-80 (warm accent `#e8825a`, near-black `--bg #0c0c0e`, `--side #0f0f11`, `--surface #151518`, `--raised #1c1c20`) — new: partial (shadcn oklch greys `--background oklch(.145)`, `--sidebar oklch(.205)`, `--card oklch(.205)`; accent is ad-hoc Tailwind `orange-500 #f97316` / `emerald-400` / `amber-400` / `rose-400` in each component). Map the classic tokens into `index.css` `.dark`/`:root` and use them (accent, ask, bad, work, run, review, select, hover, press).
- [x] Base font — classic: css:34-35, 87-93 (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter"`, body `13px/1.45`, `-webkit-font-smoothing: antialiased`; mono `ui-monospace, "SF Mono", "JetBrains Mono", Menlo`) — new: partial (`index.css:4,10` Geist Variable; components use `text-sm` 14px; no `antialiased` on body).
- [x] Focus ring — classic: css:98 (`outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px`) — new: partial (shadcn `outline-ring/50`, buttons `ring-3 ring-ring/50`, grey).
- [x] Button system — classic: css:112-137 (`.btn` 30px h, 0 11px, radius 8, border `--line-strong`, bg `--surface`, 500 weight, transition bg/border 120ms + transform 120ms ease-out, `:active` scale(.97); `.btn.primary` accent bg + accent-text, hover `brightness(1.06)`; `.btn.on` inverted text/bg; `.btn.subtle` transparent border muted; `.icon-btn` 28px radius 7 muted, hover `--press` bg + text colour, `:active` scale(.92), `.on` accent) — new: partial (shadcn Button: h-8/h-7, radius-lg, `active:translate-y-px`, no scale press, primary = grey `--primary`; orange only where hard-coded).
- [x] Key caps — classic: css:104-110 (`kbd` 18px h, min-w 18, 0 5px, `500 10.5px/1`, border 1px `--line-strong` + bottom 2px, radius 5, muted on `--surface`); in primary button css:121 (transparent, border `rgb(255 255 255/.35)`); in toast css:1031 — new: partial (`components/ui/kbd.tsx:8` bg-muted, no border, no 2px bottom edge).
- [x] Text fields — classic: css:139-144 (13.5px, radius 8, border `--line-strong`, padding 7px 10px; focus border accent + `0 0 0 3px var(--accent-soft)`) — new: partial (shadcn Input grey ring).
- [x] Scrollbars — classic: css:149-154 (`scrollbar-width: thin; scrollbar-color: var(--scroll) transparent`, hover `--scroll-hover`; dark `rgb(255 255 255/.13)` → `.28`, light `rgb(0 0 0/.16)` → `.32`) — new: missing (browser default everywhere).
- [x] Top bar — classic: main.js:727-750, css:224-229 (header 56px, padding 0 20px, gap 10, border-bottom `--line`; `h1` view name 15px/650 −0.01em) — new: missing (only floating Search + Next up over the canvas, `app/App.tsx:67-77`).
- [x] Repo crumb in the title — classic: main.js:729-730, css:230-234 (`/ repoName ×` 13px/500 muted, "/" in `--faint` with 8px gap, × at .55 opacity → 1 on hover; title "You only see this repo. Click to see all"; click clears filter) — new: missing.
- [x] Search trigger — classic: main.js:731-734, css:235-245 (width `min(340px,34vw)`, 32px h, radius 8, border `--line-strong`, `--surface` bg, `--faint` text, 13.5px, `cursor:text`; hover border accent; focus accent ring; placeholder "Search…"; `⌘K` kbd; title "Search all conversations (⌘K or /)"; kbd hidden under 1080px container) — new: partial (`App.tsx:68-70` w-64 outline button "Search", no tooltip, no accent hover).
- [x] Next up button — classic: main.js:746-748, css:1646-1650 (count pill 18px min-w, radius 9, `--ask` bg, `--surface` text 11px/700; kbd F at .7 opacity; title "Open what waits for you next: N (approvals, questions, then what is new) · F" / "Nothing waits for you · F") — new: partial (`App.tsx:71-76` pill orange-500 white; title "What waits for you next: N" / "Nothing waits for you").
- [x] Next up behaviour — classic: main.js:481-490 (toast "Nothing else waits for you" when the open one is the only one; focuses the reply box 150 ms after opening) — new: partial (`App.tsx:44-49` no "Nothing else…" toast, no composer focus).
- [x] Offline banner — classic: main.js:783-798, css:247, 1099-1100 (after 4 s without the stream: role=alert banner, `--bad-soft` bg, `--bad` text, 8px 20px, 12.5px/1.5; "**The server is not responding since HH:MM.** What you see may be out of date. macOS restarts it on its own; the page retries every few seconds. If it stays down, check `~/organizer/agent-center/logs/server.log`." ticking each second) — new: missing (`lib/live.ts:25` keeps `lostAt`, nothing renders it).
- [x] Loading skeleton before first data — classic: main.js:754, css:1013-1017 (5 bars 52px, radius 9, gradient hover→press→hover, `shimmer 1.2s linear infinite`); sidebar placeholder main.js:724 — new: missing at shell level.
- [x] Tab title — classic: main.js:347-352 (`(N) Agent Center` while N ask, `• Agent Center` when unread, else "Agent Center") — new: missing.
- [x] Dock badge — classic: main.js:175, 351 — new: done (`features/alerts/useAlerts.ts:20-22`).
- [x] Links always open in a new window — classic: main.js:449-460 (document click on any `a[href]` not `#`/download → `window.open(…,"_blank","noopener,noreferrer")`) — new: missing (no global handler; only some anchors set `target=_blank`).
- [x] Click on empty space closes the panel — classic: main.js:533-545 (pointerdown outside `.reader, .reader-resize, .card, .ccard, .note, .row, .menu, dialog, .toasts, button, a, input, textarea, select, label, .scrim` closes reader and deselects) — new: missing.
- [x] Focus reply box when a card is opened by click — classic: main.js:461-478 (pointer within 1 s, not ≤860px: focus composer after 120 ms) — new: missing.
- [x] URL parameters — classic: main.js:232-246 (`?open=<id>`, `?view=inbox|board|canvas|tiers`, `?dialog=setup|help|new|digest`, then `history.replaceState`) — new: partial (`app/Dialogs.tsx:13-25` only `new|setup|digest`; no `?open`, no `help`).
- [x] First run opens Setup — classic: main.js:85-87 — new: done (`app/Dialogs.tsx:26`).
- [x] Narrow window (≤860px) — classic: css:1116-1136, main.js:112-135, 728, 749 (sidebar off-canvas 260px, `translateX(-100%)` → 0 in 220ms ease-out, scrim `rgb(0 0 0/.3)` z 44, "Menu" hamburger icon-btn, compact New session primary 32px, canvas falls back to inbox, topbar padding 0 12px) — new: missing.
- [x] Medium window (≤1100px) panel — classic: css:1106-1114 (panel `min(640px,100vw)`, resize handle hidden) — new: missing.
- [x] Global reduced motion — classic: css:1138-1140 (all animation/transition 0.01ms) — new: missing (only `index.css:140` for the card flash).
- [x] `can-run` root class — classic: main.js:168 — new: missing (with Run on shell blocks).

## Sidebar

- [x] Container — classic: css:180-186, 161 (256px, slim 60px; bg `--side`; border-right `--line`; padding 14px 10px 10px) — new: partial (`app/Sidebar.tsx:83` 240px / 56px, `bg-sidebar` grey oklch(.205), width transition 200ms).
- [x] Brand logo — classic: sidebar.js:20-22, css:187-192 (three 4px bars radius 2 in accent, heights 16/11/7, opacity 1/.7/.45, gap 2, bottom-aligned; name 14px/650 −0.01em; padding 2px 8px 16px, gap 9) — new: partial (`Sidebar.tsx:86` orange→amber gradient square 16px).
- [x] Fold toggle — classic: sidebar.js:23-24 (title "Show the sidebar" / "Fold the sidebar to icons"; key `ac.sideSlim`) — new: partial (`Sidebar.tsx:87` aria-label only, no tooltip; key raw `sideFolded` (`Sidebar.tsx:18-31`), not shared with classic).
- [x] New session button — classic: sidebar.js:27-28, css:1387-1389 (`.btn.primary` 34px full width, plus 15, "New session", kbd N right-aligned, title "New session (N)") — new: partial (`Sidebar.tsx:90-92` orange-500 button, no kbd, title "New session").
- [x] Catch me up button — classic: sidebar.js:29-30 (`.btn` 34px, sun 14, kbd D, title "Summary of what your sessions did since you last looked (D)") — new: partial (`Sidebar.tsx:96-99` nav row, no kbd, title "Catch me up").
- [x] View nav — classic: sidebar.js:32-47, css:194-202 (Inbox/Board/Canvas/Tiers rows 30px, radius 7, muted 500; `.on` `--surface` bg + text + `0 1px 2px rgb(0 0 0/.06)`; hover `--hover`; 100ms transitions; titles "Inbox (1)", "Board (2)", "Canvas (3)", "Tiers: sessions by importance (4)") — new: partial (`Sidebar.tsx:95` a static "Canvas" row only; views themselves belong to the board audit).
- [x] Inbox pills — classic: sidebar.js:35-36, css:203-207, 931-932 ("N new" pill accent-soft/accent, title "Updated since you last looked"; asking count pill ask-soft/ask; both 18px h, radius 9, 11px/650, tabular, 4px apart) — new: missing (no unread/asking counts anywhere in the sidebar).
- [x] "Repos" heading — classic: css:208 (11px/600 uppercase, letter-spacing .05em, `--faint`, margin 18px 8px 6px) — new: partial (`Sidebar.tsx:101` 11px medium, not uppercase).
- [x] Repo rows — classic: sidebar.js:49-59, css:209-213 (28px rows, weight 450; swatch 9px radius 3 `hsl(hue 62% 55%)`; "All" swatch `conic-gradient(hsl(20 70% 58%), hsl(140 50% 50%), hsl(220 70% 62%), hsl(300 50% 60%), hsl(20 70% 58%))` and open-session count; `.n` 11.5px faint tabular; title = repo root) — new: partial (`Sidebar.tsx:104-119` swatch 10px `oklch(.72 .14 hue)`; All has no count; no root tooltip when unfolded; different conic colours).
- [ ] Repo filter persistence — classic: main.js:93, 145, 296-298 (`ac.repoFilter`; reset when the repo leaves; closes narrow sidebar) — new: missing (`app/view-state.ts:6` plain store, lost on reload; no reset).
- [x] Slim (folded) layout — classic: css:1778-1805 (icon-only centred buttons, font-size 0; pills absolute top 1 right 2, 16px×15px, 10px; "new" pill hidden; `.n` hidden; Sent files size absolute bottom −2 9.5px; foot as column gap 8; only the Setup gear (`.keep`) stays, other ghost buttons hidden; live label hidden) — new: partial (`Sidebar.tsx:122-134` keeps all four foot buttons in a column; repo tooltips on the right are an improvement).
- [x] Live indicator — classic: sidebar.js:67, css:216-219 (7px dot `--faint`; on: `--work` + `0 0 0 3px var(--work-soft)`; 12px muted "Live"/"Reconnecting…") — new: done (`Sidebar.tsx:123-125`, 6px emerald-400).
- [x] Foot toggles "on" colour — classic: css:1098 (`.ghost-btn.on` accent) — new: partial (`text-foreground`; speech off uses opacity .5).
- [x] Notifications toggle tooltip — classic: sidebar.js:69 ("Notifications on: a macOS notification when a session asks you something while you are in another window. Click to turn them off" / "Chrome blocks notifications for this app" / "Notify me (macOS) when a session asks me something while I am in another window") — new: partial (`Sidebar.tsx:128` "Notifications on/off", "The browser blocks notifications").
- [x] Sound toggle tooltip + toast — classic: sidebar.js:72; main.js:254-260 (toast "Sound on: a chime when a session finishes or asks you something" / "Sound off") — new: partial (`Sidebar.tsx:129` "Sound on/off"; `features/alerts/prefs.ts:21-25` no toast).
- [x] Read aloud toggle tooltip + toast — classic: sidebar.js:75; main.js:67-72 (toast "Read aloud off" / "Read aloud on: every session|only sessions with the bell") — new: partial (`Sidebar.tsx:131`; `prefs.ts:28-33` no toast).
- [x] Notifications test toast — classic: main.js:270-271 ("Test notification sent. If you do not see it, check the macOS notification settings for this app" / "Chrome could not show the notification: …") — new: partial (`prefs.ts:59-60` only the error toast).
- [x] Setup gear tooltip — classic: sidebar.js:77 ("Setup: hook, mod, dictation, tasks…") — new: partial ("Setup").
- [x] Keyboard help button — classic: sidebar.js:79-81 (keyboard icon + kbd `?`, title "Keyboard shortcuts (?)") — new: missing.
- [x] Extra in new: "Open the classic board" (`Sidebar.tsx:133`) — keep or drop deliberately.

## Limits

- [x] Limits box — classic: css:1367 (bordered card: 1px `--line`, radius 10, `--surface` bg, padding 10px 10px 8px, margin 10px 2px 0, rows gap 10) — new: partial (`Sidebar.tsx:46` border-top strip, px-3 py-3, gap-3).
- [x] Stale data — classic: sidebar.js:196, 218-219, css:1368 (when `limits.at` > 30 min old: opacity .55, title "Data from X ago: no open session has updated it"; else title "Plan limits") — new: missing.
- [x] Row head — classic: sidebar.js:222, css:1369-1374 (12px muted row; label 600 in text colour; pct 650 tabular; ≥70 `--ask`, ≥90 `--bad`) — new: done (`Sidebar.tsx:64`).
- [x] Track — classic: sidebar.js:223, css:1375-1378 (8px h, radius 4, `--hover` bg; fill `--work` green, ≥70 `--ask`, ≥90 `--bad`) — new: partial (`Sidebar.tsx:65` Progress 6px, normal fill zinc-400 not green).
- [x] Elapsed-time marker — classic: sidebar.js:202, 223-224, css:1379 (`<s>` 2px wide, top/bottom −3px, radius 1, text colour at .55, `left: elapsed%`; track title "N% of the time has passed"; WINDOW_MS sidebar.js:141) — new: missing.
- [x] Already reset / no reset — classic: sidebar.js:199-200, 226 (reset in the past → 0% and "Already reset"; no time → "No reset time") — new: missing (shows the stale % and hides the line).
- [x] "Resets in" line — classic: sidebar.js:146-153, 226, css:1380-1381 ("Resets in **2 h 10 min**", bold value 600 tabular; `untilText` gives "2 d" when hours are 0) — new: partial (`Sidebar.tsx:34-39, 66` no bold; prints "2 d 0 h").
- [x] Reset time + pace — classic: sidebar.js:143, 162-168, 213, 228, css:1382-1384 ("today at 14:20 · on pace", "tomorrow at …", "Monday at …"; pace with 5-point slack: under `--work`, over `--ask`, 11.5px faint) — new: missing.
- [x] Forecast — classic: sidebar.js:172-178, 229-230, css:1653-1655 ("At this pace, full at **14:20**" in `--bad`, or "At this pace, about **N%** at reset"; hidden when pct < 3 or < 8% of the window gone; title "If you keep the pace of the time gone by in this window") — new: missing.
- [x] Top spenders (5-hour window) — classic: sidebar.js:182-186, 231-234, css:1656-1660 (up to 3 sessions by `usage.recentCost`, share %, 22px rows that open the session, hover bg; title "Share of what your sessions spent in the last 5 hours, at API prices (the plan does not say what each one used)") — new: missing.
- [x] Slim rings — classic: sidebar.js:132-139, css:1796-1803 (34px; `radial-gradient(circle, var(--side) 12px, transparent 12.5px), conic-gradient(var(--ring) v%, var(--line-strong) 0)`; ring/number `--muted`, `--ask` ≥70, `--bad` ≥90; title "5 hours: N% used") — new: partial (`Sidebar.tsx:52-61` 36px, hex `#a1a1aa/#fbbf24/#fb7185`, number not toned; tooltip adds reset time, keep that).

## Sessions memory & Sent files

- [x] Sessions memory row — classic: sidebar.js:88-114, css:1390-1401 (gauge 14 + "Sessions" + pressure label "Memory low"/"Out of memory" 10.5px/600 `--bad` + total `memText` right; tone `--run` when pressure ≠ normal or any session ≥ 1 GB; aria-expanded toggles the list; title "Memory your sessions and what they started take on this Mac (Activity Monitor's Memory column). Click to see which"; row 30px radius 8, 12.5px, hover bg) — new: missing.
- [x] Heavy sessions list — classic: sidebar.js:98, 120-125, css:1402-1408 (sessions ≥ 100 MB, biggest first; 26px rows indented 32px; ≥ 1 GB in `--run`; tooltip lists processes ≥ 10 MB "• label · cwd · size"; click opens the session; empty "No session takes 100 MB"; max-height 220 scroll) — new: missing.
- [x] Forgotten commands — classic: sidebar.js:101-119, css:1663-1666 ("N left running, unused · X" in `--run`; tooltip "Up for hours and idle for over 30 min:\n• …"; link "Stop them" → "Sure? Stop them" (red, 600) for 4 s → POST `/api/memory/stopforgotten`; toast "Stopped X of N") — new: missing.
- [x] Sent files — classic: sidebar.js:16-18, 63-65, css:1390-1398 (paperclip 14 + "Sent files" + `bytesText`; amber ≥ 500 MB, red ≥ 1 GB; click POST `/api/uploads/open`, toast "Could not open the folder"; title "Open the sent files folder in Finder") — new: missing.

## Keyboard shortcuts & help

- [ ] `?` opens help (also Shift+/) — classic: main.js:559 — new: missing.
- [ ] `⌘K` and `/` search — classic: main.js:557-564 — new: done (`App.tsx:53-55`).
- [ ] `F` Next up — classic: main.js:650 — new: done (`App.tsx:56`).
- [ ] `N` new session — classic: main.js:649 — new: missing.
- [ ] `D` Catch me up — classic: main.js:651 — new: missing.
- [ ] `J`/`K`, `↓`/`↑` move the selection (scroll into view, open panel follows, card focus follows) — classic: main.js:595-614 — new: missing.
- [ ] `↵` opens the selected session (not on buttons/links/options, `ENTER_KEEPS` main.js:26) — classic: main.js:615-617 — new: missing.
- [ ] `O` Open in Claude — classic: main.js:618 — new: missing.
- [ ] `T` rename (opens panel, starts title edit) — classic: main.js:619-624 — new: missing.
- [ ] `R` reply (open panel, focus reply box) — classic: main.js:625-630 — new: missing.
- [ ] `P` pin/unpin — classic: main.js:631 — new: missing.
- [ ] `A` Later menu, then `1`–`5` (PARK_OPTIONS util.js:162-168); on a parked card `A` unparks — classic: main.js:577-585, 632 — new: missing.
- [ ] `E` done / reopen — classic: main.js:633 — new: missing.
- [ ] `C` colour menu, then `1`–`7` / `0` none — classic: main.js:586-594, 634 — new: missing.
- [ ] `Z` undo the last toast action — classic: main.js:635, 359 — new: missing.
- [ ] `G` lanes per repo, `1`–`4` views, `[`/`]` tier — classic: main.js:636-648 — new: missing (only matters if the views return).
- [ ] `S` stop the running turn — classic: main.js:652 — new: missing.
- [ ] `U` mark to review — classic: main.js:653 — new: missing.
- [ ] `Esc` chain — classic: main.js:565-574 (in a field: blur; else close Later menu; else colour menu; else workspace → Conversation; else close panel and deselect) — new: partial (`features/session/SessionPanel.tsx:28-36` ignores focus: `Esc` inside the reply box closes the whole panel).
- [ ] Shortcuts off while a dialog/search is open; typing detection incl. Monaco — classic: main.js:555-556, util.js:194-195 — new: done (`App.tsx:33-34, 54`).
- [ ] Help dialog — classic: dialogs.js:127-166, css:1052-1058 (title "Keyboard shortcuts"; width `min(440px, 100vw−32px)`; rows 7px 0 with 1px `--line` divider; label muted; keys as kbd joined by "or" (11px muted); 22 rows: Move J K or ↓ ↑ · Open conversation ↵ · Reply R · Rename T · Open in Claude O · Pin P · Colour C or 0–7 · Later A or 1–5 · Mark as done E · Undo Z · Search / or ⌘ K · Inbox · Board · Canvas · Tiers 1 2 3 4 · Tiers: one row up · down [ ] · Lanes per repo G · Next up: what waits for you F · New session N · Catch me up D · Stop the running turn S · Mark to review U · Canvas: zoom in · zoom out · fit + − 0 · Canvas: move the view (hold and drag) Space · Close Esc; backdrop click closes) — new: missing (list only the shortcuts the new app has).

## Reader panel (session panel)

- [x] Slide in/out — classic: css:170-176, main.js:318-336 (slot `translateX(104%)` → none, 420ms `cubic-bezier(0.25,1,0.5,1)`; content opacity 320ms + `translateX(28px)`; first open also animates content via WAAPI 420ms; on close the content stays 440ms so it slides out) — new: partial (`App.tsx:78` tw-animate `slide-in-from-right-8 fade-in duration-300` on open only; no exit animation).
- [x] Panel chrome — classic: css:177, 488-491 (`--shadow-pop`, border-left `--line`, `--surface` bg) — new: partial (`SessionPanel.tsx:42` `shadow-2xl`, `bg-card`).
- [x] Default width — classic: main.js:663-666 (`min(760, max(420, round(vw·0.42)))`, never above `vw − 300`) — new: partial (`SessionPanel.tsx:42` `min(680px,46vw)`, min 420, no `vw−300` cap).
- [x] Resize by dragging the left edge — classic: main.js:667-686, 766-767, css:1356-1364 (7px handle, `col-resize`; hover/drag `color-mix(accent 45%)`; clamps 380…vw−300; saved `ac.readerW`; double-click resets; title "Drag to change the width · double-click: default width"; transitions off and `user-select:none` while dragging) — new: missing.
- [x] Widen toggle — classic: reader.js:143-144, main.js:116, 665-666 (expand/shrink icon-btn, titles "Widen the panel" / "Normal width"; wide = `max(base, 75vw)`; Changes asks for room automatically) — new: missing.
- [ ] Workspace width (Changes, Code, Files) — classic: main.js:50-51, 664-666 — new: done (`SessionPanel.tsx:42`).
- [x] Head layout — classic: css:493-498 (padding 10px 12px 10px 20px; bar min-height 30px gap 10; tools gap 4) — new: partial (`SessionPanel.tsx:43-52` px-5 pt-3, xs text row).
- [x] Status chip — classic: reader.js:136, components.js:79-97, css:262-271, 252-260 (chip 22px, radius 6, 11.5px/600, tone bg (ask-soft, work-soft, review-soft, bad-soft, hover); permission lock icon, parked clock, done check, else 7px dot that pulses (`pulse 1.6s ease-in-out infinite`, 4px work-soft ring) when working) — new: partial (`SessionPanel.tsx:45` StateIcon 18 + coloured label text, no chip bg).
- [x] Repo tag — classic: components.js:109-111, css:273-274 (12px/600, text `hsl(hue 55% 70%)`, 7px square radius 2 `hsl(hue 62% 55%)`) — new: partial (`SessionPanel.tsx:46` muted text, oklch square).
- [ ] Branch — classic: reader.js:138, css:275 — new: done (`SessionPanel.tsx:47`).
- [x] Actions in the head — classic: reader.js:140, components.js:272-322, css:330, 438-439 (compact 24px icon buttons: Open in Claude "(O)", Pin star "(P)" accent when on, bell "Tell me when it finishes or asks me something", Run play, palette colour menu "(C)" tinted, eye "Mark to review … (U)" when pending, stop "(S)" hover red when working, clock Later menu "(A)" / unpark, check "Mark as done (E)" or undo "Reopen (E)" + archive) — new: missing in the panel (only on the card's "…" menu, `features/session/CardMenu.tsx`; no colour, no mark-to-review, no stop).
- [x] Open in Claude button — classic: reader.js:141-142, css:499 (`.btn.primary.sm` 28px, 12.5px, external icon 12; title "Open in Claude (O)") — new: partial (`SessionPanel.tsx:49` orange-500, no title).
- [x] Close button — classic: reader.js:145 (title "Close (Esc)") — new: partial (aria-label only).
- [x] Title and rename — classic: reader.js:21-57, css:496, 945-948 (h2 16px/650 −0.01em, clamp 2; double-click, pencil button (22px, opacity 0 → 1 on hover, 120ms) or `T` → input 15px/650 maxLength 140, Enter saves, Esc cancels, blur saves; optimistic; "renamed" tag with title "Name set on the board; Claude desktop keeps its own"; h2 title "Double-click or T to rename (on the board only)") — new: missing (`SessionPanel.tsx:53` static text).
- [x] Session not on the board (opened from search) — classic: reader.js:130-131, main.js:717 (title and repo from the search result; reply box still shown) — new: missing (shows "Conversation", `features/conversation/Chat.tsx:13` hides the composer without a card).
- [x] Tabs look — classic: reader.js:71-78, 150-154, css:503-512 (icons chat/diff/code/pr/file/tasks 14px at .7; 9px 10px, 13px/550 muted, hover text; selected text + 2px underline radius 2, inset 10px each side; count 11px muted tabular; hidden scrollbar; title = label) — new: partial (`SessionPanel.tsx:54-60` shadcn line tabs, no icons, no titles).
- [x] Tab order — classic: reader.js:71-78 (Conversation, Changes, Code, PRs, Files, Tasks) — new: partial (`SessionPanel.tsx:23` Files before PRs).
- [x] Tasks tab only when the organizer is on — classic: reader.js:80-82, main.js:769 (`data.features.organizer`) — new: missing (always shown).
- [x] Code tab kept alive — classic: reader.js:86-89, 163 (mounted once, hidden with `display:none` when another tab shows: open files, view, unsaved text survive) — new: missing (`SessionPanel.tsx:66` unmounts; switching tabs drops unsaved edits).
- [x] Open a file from the conversation in Files — classic: main.js:696, reader.js:156 (`showFile(path)` → Files tab with that file) — new: missing.
- [ ] Bridge poll 2.5 s — classic: reader.js:93-100 — new: done (`features/conversation/useBridge.ts`).
- [x] Review comments sent → back to Conversation — classic: reader.js:122-128 — new: missing (`features/changes/Changes.tsx:185` stays in Changes).

## Conversation

- [x] Layout — classic: css:517 (padding 18px 20px 12px, gap 14) — new: partial (`ConversationView.tsx:271` AI Elements p-4 gap-4).
- [x] Your bubble — classic: css:519-523 (right-aligned, max 88%; `--accent-soft` bg, border `color-mix(accent 18%)`, radius `14px 14px 4px 14px`, padding 8px 12px, 13.5px, pre-wrap) — new: partial (AI Elements user Message, grey secondary bubble).
- [x] Long message folding — classic: conversation.js:185-214, css:524-525 (typed text > 700 chars clamps to 12 lines; "Show all"/"Show less" 12px/600 accent) — new: missing.
- [x] Pasted blocks — classic: conversation.js:211-212, css:526-530 (bordered box accent 22%, radius 8, summary "▸ Pasted text · N line(s)" / "▾" 12px/600 muted; pre max-h 320 mono 11.5) — new: partial (`ConversationView.tsx:44` plain details, always "lines").
- [x] Sent images and files in the bubble — classic: conversation.js:215-221, css:1336-1347 (images max 220×160 radius 8 bordered, title "Open the image"; file chips 30px radius 8, title "Open the file") — new: partial (`ConversationView.tsx:45-54` max-h-40 only, no titles).
- [x] Time stamp — classic: conversation.js:277-282, css:531 (HH:MM 11px faint under each message of yours; "during the turn · " prefix with title "You wrote it while Claude was working") — new: missing.
- [x] Fork from a message — classic: conversation.js:278-279, 311-347, css:1265-1271 (hover-revealed link "Fork" with fork icon, opacity 0 → 1 120ms, title "New session with the conversation up to just before this message; the original does not change") — new: missing (known).
- [x] Markdown styling — classic: css:534-576 (13.5px/1.6; headings 14px/650; links accent, underline offset 2; inline code `--code-text #f28b82` on `rgb(242 139 130/.1)` with border `.2`, radius 5, 1px 5px; code blocks `--side` bg, border, radius 9, wrapped lines; tables 12.5px with `--side` header; blockquote 3px `--line-strong`; hr) — new: partial (`components/ai-elements/message.tsx:326-340` Streamdown defaults).
- [x] Code block copy — classic: util.js:61-122, css:548-557 (sticky top 8px; "Copy" button 24px radius 6, opacity .75 → 1 on block hover; "Copied" in `--work` for 1.5 s; "Could not copy"; press scale .97) — new: partial (Streamdown code plugin button; labels and look differ).
- [x] Run on shell blocks — classic: conversation.js:18-61, util.js:64-88, css:558-570 (Run button in `--work`, output panel with beating dot "Running in the session's folder…", Stop, results "Done in N s" / "Ended with code N in N s" / "Stopped after N s") — new: missing (known).
- [x] File paths become links to the Files tab — classic: util.js:51-80, conversation.js:461-466, css:1591-1593 (inline code that is a path, relative links; dotted underline, hover accent, title "Open <name> here") — new: missing.
- [x] Tool runs — classic: conversation.js:171-183, css:578-584 (head "N actions" with chevron + tool icon, last line in mono 11.5 faint; open list with 2px left rule, 18px indent, mono 11.5, line title) — new: partial (`ConversationView.tsx:137-146` AI Elements Task, title "N actions · last").
- [x] Plan — classic: conversation.js:131-139, css:968-977 (bordered radius 12; "Plan" + done/total; pending dashed 14px circle; in progress accent ring spinning `spin 1s linear infinite`; done filled `--work` dot with inset; done text muted, no strike) — new: partial (`ConversationView.tsx:148-163` lucide icons, line-through, no spin).
- [x] Next-step box — classic: conversation.js:287-292, css:586-593 (`--side` bg, border, radius 12; recap rendered as Markdown 13px muted; question with 17px `--ask` disc "?"; picked shown as "↳ label") — new: partial (`ConversationView.tsx:165-181` recap as plain text, no disc, picked as disabled buttons).
- [x] Reply choices at the bottom — classic: conversation.js:474-479, css:902-911 (when the card asks and nothing is pending: pills 26px radius 13, 12px/600, ask border 45% / ask-soft bg / ask text; first filled `--ask`; press scale .96; hover tint; title = message) — new: missing (new puts buttons inside the Next box instead).
- [x] Template replies — classic: main.js:498-511 (a reply ending in ":" / "…" / "..." fills the reply box, cursor at end, never sends) — new: missing (`ConversationView.tsx:166` sends it).
- [x] Question card — classic: conversation.js:230-271, css:950-967 (width min(520px); "?" disc; "You can pick several" 12px faint; options 7px 10px radius 8; chosen accent 60% border + accent-soft; radio/box 14px with inset dot; answered others .55; hover; press scale .99; "Your own answer" row; "Another answer…" + Send) — new: partial (`ConversationView.tsx:66-106` emerald chosen, no help text, no "Your own answer" label).
- [x] App-only dialog item — classic: conversation.js:141-169 (long detail as "Show the plan" details with Markdown; "**Your answer:** New branch: X" via `dialogAnswer`) — new: partial (`ConversationView.tsx:201-208` clamp-6 plain text, raw answer).
- [x] "Answer in Claude" — classic: conversation.js:150-156, css:979-981 (reason "You can answer this only in Claude desktop." + primary button with external icon) — new: partial (`ConversationView.tsx:59-61` outline button, no reason).
- [x] Approval card — classic: conversation.js:350-363, css:1518-1519 ("?" disc "Allow Claude to use X?"; `pre` mono 12, max-h 180, `--surface`; Deny / Allow primary) — new: partial (`ConversationView.tsx:109-121` rose box, black pre).
- [x] Pending messages — classic: conversation.js:480-491, css:532, 1503-1504 (bubble opacity .65 dashed border; stamps "Queued: delivered when the turn ends" / "Sending…" / "Waking the session in the background…"; stuck/untrusted in `--bad` with "Open in Claude" link and Undo) — new: partial (`ConversationView.tsx:123-135`, `pending.ts:44-51` whole message at .7, no dashed border, "Waking the session…").
- [x] Chapter divider — classic: css:594-595 (uppercase 11.5px/650 .04em faint between lines) — new: partial (`ConversationView.tsx:198` not uppercase).
- [x] File chips Claude sent — classic: files.js:54-74, css:1338-1347, 1553-1556 (caption; chip with coloured ext tag by family, name, size or "gone"; click opens Files tab) — new: partial (`ConversationView.tsx:210` static spans, not clickable, no size).
- [x] Artifact card — classic: files.js:77-86, css:1559-1564 (card radius 10, accent file icon, name without extension, "Published on claude.ai", "View file" + "Open ↗") — new: partial (`ConversationView.tsx:212` bare link).
- [x] "Running now" box — classic: components.js:367-413, css:1426-1449 (background tasks and processes: icon, what, kind, age, idle (forgotten in `--run`), memory (≥ 1 GB `--run`), "Stop" link → `/stopprocess`; head "Running now" with beating dot and total "X in memory") — new: missing.
- [ ] Loading skeleton — classic: conversation.js:468, css:1014-1016 — new: done (`ConversationView.tsx:268`).
- [x] Load earlier — classic: conversation.js:446-453 (keeps the scroll position) — new: partial (`ConversationView.tsx:272`; position kept only if stick-to-bottom allows).
- [x] "New messages" pill — classic: conversation.js:494-499, css:597-601 (sticky bottom 4px, 28px radius 14, `--text` bg / `--bg` text, 12px/600, arrow-down, shadow-pop; only when new items arrived while scrolled up) — new: partial (`ConversationScrollButton` icon-only, shows whenever scrolled up).

## Composer

- [x] Frame — classic: css:604-610 (form padding 10px 14px, border-top `--line`, `--surface`; box radius 14, border `--line-strong`, `--raised`; focus-within accent border + 3px accent-soft, 120ms) — new: partial (`Chat.tsx:13` px-4 pb-4, PromptInput grey).
- [x] Drop highlight — classic: attachments.js:83-92, css:610 (`.drop` accent ring while dragging files) — new: partial (PromptInput accepts drops; no highlight).
- [x] Placeholder — classic: composer.js:179 ("Reply… (paste or drag images and files)") — new: partial (`Composer.tsx:110` "Reply…" / "Answer…").
- [x] Field — classic: css:611-615, composer.js:77-96 (13.5px/1.5, padding 11px 14px 4px, min 44, grows to 220px, re-measures on width change) — new: partial (PromptInputTextarea defaults).
- [x] Keys — classic: composer.js:182-185 (Enter sends and stops dictation, Shift+Enter newline, Esc blurs) — new: partial (Esc closes the panel, see Keyboard).
- [x] Draft — classic: composer.js:18-53 (3 days; saved again on close; picked files kept per session while the page is open) — new: partial (`Composer.tsx:26-35, 69-72` text only, no save on close, files lost).
- [x] Focus/fill hooks — classic: composer.js:56-76 (focus with cursor at end; fill for templates and Undo) — new: partial (`send.ts:9` fill only).
- [x] Attach button and previews — classic: attachments.js:97-114, css:1332-1335, 1348-1349 (tooltip "Attach images, PDFs or any file (you can also paste or drag them)"; 64px thumbs radius 8, round 18px dark remove; file chip 64px tall with size, titles "Remove the image/file") — new: partial (`prompt/PromptExtras.tsx:14-31` AI Elements inline chips, tooltip "Attach files (or paste or drop them)").
- [x] File limits — classic: attachments.js:64-72 ("Each file can be up to 500 MB (and cannot be empty)", "Up to 10 files per message") — new: done (`PromptExtras.tsx:11-12`).
- [x] Whisper recording pill — classic: mic.js:104-116, css:1451-1466 (pill 30px radius 15, `--bad-soft` bg, border bad 35%, hover tint; `rec-dot` 8px with `rec-dot 1.2s` ring; canvas wave 102×20, 34 bars, newer bars brighter; time; stop icon 11; opens with `pill-open 260ms` scale .9 → 1; title "Stop and write (↵) · discard (Esc)"; "Transcribing…" pill accent-soft with small spinner) — new: partial (`PromptExtras.tsx:102-111` 24 span bars, `animate-pulse` dot, no stop icon, no open animation, tooltip "Write it (↵) · drop it (Esc)").
- [x] Browser dictation — classic: composer.js:123-145, 189-191 (mic turns `--bad` while on; titles "Stop dictation (Chrome uses Google's servers)"; toasts "Chrome has no permission to use the microphone", "Dictation stopped: X", "Could not start dictation") — new: partial (`PromptExtras.tsx:113, 115-127` square stop icon, no error toasts).
- [x] Settings pickers — classic: composer.js:231-259, css:1472-1500 (pill with icon lock/bot/gauge + value + chevron that turns 180° in 150ms; menu opens upward, min-width 250, `@starting-style` scale .96 translateY 4px; each option bold label + hint, check on current, accent-soft bg; Esc/outside closes) — new: partial (`Composer.tsx:37-44` shadcn Select, no icons, no hints).
- [x] Option hints — classic: composer.js:215-227 (Ask "Asks for approval before each risky action"; Accept edits "Edits files without asking; asks for the rest"; Plan "Only researches and proposes a plan; changes nothing"; Auto "A classifier decides what to allow without asking you"; "Bypass permissions" "Asks nothing: use it with care"; Fable 5.1 "The most capable"; Opus 5.5 "Very capable, for complex work"; Sonnet 5.5 "Fast and capable"; Haiku 5.5 "The fastest and cheapest") — new: missing (labels only; "Bypass" instead of "Bypass permissions").
- [x] Pending change state — classic: composer.js:267-287, css:1477-1478, 633 (picker keeps the asked value with blinking amber dot `blink 1s` until the mod answers; disabled with title "This session started with an older bridge mod: close it and open it again" when bridge < v4; unknown current value added to the list) — new: missing.
- [x] Effort is read-only — classic: composer.js:289-294 (read-only pill, title "Effort (read-only). Change it in Claude desktop: it sends its own with every message") — new: partial/regression (`Composer.tsx:118` offers an Effort picker that posts a change).
- [x] Model tooltip — classic: composer.js:292 ("Model. Claude desktop still shows the previous one in its picker, but the session uses this one") — new: missing.
- [x] Change toasts — classic: composer.js:271, 278 ("Change sent: it applies as soon as the session is free" / "Change saved: it applies when the session opens" / "Could not change: …" / "Change applied") — new: partial (`Composer.tsx:80-86` "Change sent").
- [x] Stop button — classic: composer.js:194-195, css:1145-1146 (`.btn.subtle.stop`, stop icon 12, hover `--bad`, title "Stops the running turn, like Esc in Claude desktop (S)"; toast "Stopping “title”…") — new: partial (`Composer.tsx:121` no title, toast "Stopping…").
- [x] Wake / Open in Claude — classic: composer.js:149-155, 196-200 (subtle buttons in the toolbar; Wake shows "Waking…" state for 8 s; titles "Starts the session in Claude, in the background, so it gets messages" / "Opens the session in Claude desktop") — new: partial (`Composer.tsx:129-130` links in the status line, no 8 s state).
- [x] Send button — classic: composer.js:201-203, css:623 (primary accent 32px radius 10, send icon 14; title "Send (↵) · new line (⇧↵)" or "Archived in Claude: unarchive it there to write") — new: partial (PromptInputSubmit, no title).
- [x] Status line texts — classic: composer.js:158-173, css:624-625, 1501-1502 ("Checking the session…", "Archived in Claude: it does not wake until you unarchive it there (Open in Claude)", "Claude does not trust this session's folder: open it in Claude and accept", "The session did not wake: open it in Claude", "Session open: it arrives in a few seconds", "Busy: delivered when the turn ends", "Waking the session in the background…", "Session asleep: when you send, it wakes in the background") — new: partial (`Composer.tsx:49-58` shorter: "Open", "Asleep: it wakes when you send"…).
- [x] Context meter — classic: composer.js:208, components.js:186-195, css:934-942 (bar 64px × 4px; "N% context · Xk tokens"; ≥ 65% `--ask`, ≥ 85% `--bad`; title "Context used: Xk of Yk tokens (N%) — consider starting a new session") — new: missing in the composer.
- [x] Wake toast on send — classic: composer.js:115 ("The session was asleep: waking it in the background") — new: partial (`send.ts:24` "Message sent: waking the session").

## Changes

- [x] Head — classic: changes.js:137-147, css:1201-1204 ("N file(s) · +A −D" with `--work`/`--bad` 650; branch text with title = root) — new: partial (`Changes.tsx:188-196` always "files", no root tooltip).
- [x] Tree toggle — classic: changes.js:100-101, 140-141 (icon-btn, titles "Hide the tree" / "Show the tree of changed files", `ac.changesTree`) — new: missing.
- [x] Lines / Side by side switch — classic: changes.js:142-145, css:1764-1766 (`.seg` on `--press` bg, radius 8; selected `--surface` + `--shadow`; titles "Line by line, with comments for the session" / "Side by side, in VS Code's diff view"; `ac.changesView`) — new: partial (outline ToggleGroup, no titles, raw key `changesView` without `ac.`).
- [x] Refresh button — classic: changes.js:146 — new: missing.
- [x] Loading / empty / truncated — classic: changes.js:132-133, 149-150 (spinner; "No changes against base."; "The diff is very large: only the start is shown.") — new: partial (text loader; truncated note missing).
- [x] File block header — classic: changes.js:67-74, css:1208-1220 (sticky top −10px, `--raised`, radius 10 top; chevron rotates 90° in 150ms; folds on click; files > 400 lines start folded; status word new/deleted/renamed 10.5px/700 uppercase coloured; path mono 12 RTL ellipsis with title "old → new"; "N comment(s)" ask tag; +/− stat) — new: partial (`Changes.tsx:118-119` FileIcon + path only, not sticky, no fold, no status word, no stats).
- [x] Hunks — classic: css:1222-1224 (header mono 11.5 faint on `--hover`; dashed rule between hunks) — new: partial (sky tint).
- [x] Diff line — classic: changes.js:30-42, css:1225-1234 (grid 40/40/16/max-content, 12px/1.55 mono; add/del bg 11% work/bad; hover inset 3px accent bar; commented line inset 3px `--ask` bar; title "Click to comment on this line") — new: partial (`Changes.tsx:132-139` hover brightness, comment outline).
- [x] Saved comment — classic: changes.js:44-49, css:1235-1241 (indented 96px, ask-soft box radius 8, pencil icon, × remove (title "Remove the comment"), title "Click to edit it") — new: partial (`Changes.tsx:141` no remove, no pencil).
- [x] Comment editor — classic: changes.js:50-59, css:1242-1248 (accent border + ring; hint "⌘ ↵ save · Esc cancel" with kbds; Cancel subtle, Save primary) — new: partial (`Changes.tsx:91-103` no hint).
- [x] Changed-files tree — classic: code.js:550-610, css:1769-1776 (compact folders like "src/models", foldable, folder icon `#c99a3b`/open `#dcb67a`, status letter, +/− delta, pencil comment count) — new: partial (`Changes.tsx:63-89` flat list with dir suffix).
- [x] Side by side path bar — classic: code.js:659 (mono 12 "old → new") — new: missing.
- [x] Comments bar — classic: changes.js:158-162 — new: done (`Changes.tsx:205-211`).
- [x] Poll every 5 s when visible — new: done.

## Code

- [x] Tree column — classic: css:1690 (`minmax(210px, 28%)`) — new: partial (`CodeWorkspace.tsx:287` `minmax(220px, 22%)`).
- [x] Folder rows — classic: code.js:132-144, css:1695-1709 (chevron rotates in 120ms; folder icon `#c99a3b`, open `#dcb67a`, fill 25%; changed dot 6px `--ask` .7 with title "Has changes") — new: partial (`CodeWorkspace.tsx:51-56` one colour, no title).
- [x] File status tooltips — classic: code.js:130, 149 ("Modified", "Added", "New, not in git yet", "Renamed") — new: missing.
- [x] Selected row — classic: css:1707 (`--select`) — new: partial (bg-accent).
- [x] Truncated tree — classic: code.js:513 ("Only the first N files show.") — new: missing.
- [x] Editor tabs — classic: code.js:517-523, css:1717-1725 (32px; on: `--surface` + inset −2px accent; git status letter in the tab; dirty 8px dot that becomes × on hover; titles "Not saved (⌘S saves)" / "Close") — new: partial (`CodeWorkspace.tsx:309-321` no status letter, no titles).
- [x] Editor waiting texts — classic: code.js:532-534 ("Downloading the editor (VS Code's Monaco, once)… N%", "Loading the editor…", "The editor could not load: X", "Open a file from the tree, or press ⌘P" with kbd) — new: partial ("Getting the editor ready… N%").
- [x] Quick open ⌘P — classic: code.js:156-193, css:1737-1744 (panel under the tabs, 560px; fuzzy ranking (name match first); ↑↓ ↵ Esc; closes on blur) — new: partial (`CodeWorkspace.tsx:343-366` cmdk dialog, cmdk's own filter order).
- [x] Search panel — classic: code.js:209-262, css:1750-1762 (⌘⇧F selects the field; per-file fold; dir path; "N result(s) in N file(s)" singular forms; hit text with match `<mark>` ask-soft and leading "…"; opening selects the exact match; kept mounted so the query stays) — new: partial (`CodeWorkspace.tsx:72-112` no highlight, no fold, no dir, selects whole line, unmounts on switch).
- [x] Theme follows the OS live — classic: code.js:38-39, 316-317 — new: partial (fixed dark).
- [x] File type labels — classic: code.js:70-95 (also Makefile MK, ipynb NB, mts/cts/cjs, jsonc/jsonl, ini, mdx, log, tsv, htm, less, astro, gql, bash, fish, ps1, prisma, proto, h, hpp, icns; lock uses the lock glyph) — new: partial (`components/common/FileIcon.tsx:5-24` subset).
- [ ] Save, conflict notice, compare, follow disk, remembered tabs, margin marks, beforeunload — new: done.

## Files

- [ ] Layout — classic: css:1566-1590 (list on top, max 30% height; viewer below) — new: partial (`Files.tsx:88` side list; acceptable as a choice).
- [ ] Type label — classic: files.js:24-33, css:1553-1556, 1675-1679 (18px mono 9.5 uppercase tag coloured by family: sheet green, doc blue, slides orange, pdf red, media accent) — new: partial (FileIcon labels).
- [ ] List rows — classic: files.js:104-106, css:1567-1573 (30px; "sent · 5 min" small; on `--select`; "Looking…"; empty "This session has not sent or written any file yet.") — new: partial (adds size).
- [x] Refresh every 10 s — classic: files.js:92-98 — new: missing (`Files.tsx:81-83` once).
- [ ] Open a given file (from conversation) — classic: files.js:89, 99 — new: missing.
- [ ] Viewer head — classic: files.js:195-202, css:1575-1578 (name bold 13.5 + path with `~` and size; "Source"/"Rendered" toggle for Markdown; copy path icon "Copy the path"; "Show in Finder"; "Open on the Mac"; toast "Could not open it") — new: partial (`Files.tsx:103-112` raw path, no size, no Source toggle).
- [ ] Viewable check — classic: files.js:145-153, 164-169 (`/fileinfo`: "Too large to show here (X)."; errors) — new: partial (client 30 MB cut, `Files.tsx:45`).
- [ ] Markdown page — classic: css:1581-1586 (max 760px, padding 18px 22px 40px, 14.5px/1.65; h1 24, h2 19, h3 16) — new: partial (max-w-3xl Streamdown).
- [ ] Tables — classic: files.js:172-174, css:1684-1687 (sticky header row on `--side`; 1000 rows with "Only the first 1000 rows show here.") — new: partial (`Files.tsx:42, 62-69` 500 rows, no note, header not sticky).
- [ ] Audio — classic: files.js:16, 189-190 (`mp3|wav` → `<audio controls>`) — new: missing.
- [ ] Quick Look fallback — classic: files.js:191-194, css:1681-1683 (caption "The first page, as Quick Look shows it. Open it on the Mac for all of it."; failure "macOS has no preview for this kind of file: open it on the Mac.") — new: partial (no caption; different failure text).
- [ ] Text as Monaco, images, video, PDF, sandboxed HTML, Office in shadow root — new: done.

## PRs

- [x] Intro — classic: prs.js:171 ("PRs from this session's branch and PRs named in the conversation.") — new: missing.
- [x] Refresh every 30 s and after an action — classic: prs.js:161-166, 100 — new: missing (`Prs.tsx:72-74` once).
- [x] Open first, then "Merged and closed (N)" fold — classic: prs.js:168-176 — new: missing.
- [x] Card — classic: prs.js:110-121, css:986-995 (state chip; "repo#N ↗" link title "Open on GitHub"; age; h3 14px/600; "base ← head" mono; "+A −D · N file(s)"; closed at opacity .75) — new: partial (`Prs.tsx:26-46` badges, arrow reversed "head → base", no age, no fade).
- [x] "Ready to merge?" — classic: prs.js:33-81, css:1252-1262 (rows with ✓ ✗ • – marks: checks, review, unresolved threads from `/readiness`, uncommitted/unpushed, open tasks, conflicts, behind; buttons "Ask it to fix them", "Send to the session", "Ask it to resolve them" that send prepared messages) — new: missing.
- [x] Merge state line — classic: prs.js:18-29, 125, css:996-997 (dot + "Ready to merge", "Has conflicts with the base branch", "Can be merged, but some checks are failing", "Out of date with the base branch", "Blocked by the repo's rules (required review or checks)", "GitHub is working out whether it can be merged") — new: missing.
- [x] Merge flow — classic: prs.js:126-145, css:1000-1006 (method select Squash / Merge commit / Rebase saved `ac.mergeMethod`; "Delete branch" checkbox `ac.deleteBranch`; confirm strip "Merge #N into base with squash and delete the branch?" with "Still pending: …" and "Merge anyway"; close confirm "Close #N without merging?" with danger "Close PR") — new: missing (`Prs.tsx:50-61` merges on menu click, no confirm, no delete-branch).
- [x] Busy labels and toasts — classic: prs.js:93-101, 139-153 ("Merging…", "Marking…", "Closing…", "Reopening…"; "#N merged" / "Could not do it: …") — new: partial (`Prs.tsx:22-24` "Merge: done").
- [x] Draft actions — classic: prs.js:146-149 ("Mark as ready", "Convert to draft") — new: partial ("Ready for review", "Back to draft").

## Tasks

- [x] Intro — classic: tasks.js:35 ("Tasks from your organizer created in this conversation.") — new: missing.
- [x] Reload on each live update — classic: tasks.js:13 (`taskSignal`) — new: missing.
- [x] Close with Undo — classic: tasks.js:15-23 (optimistic; toast "Task done: <text>" with Undo/Z) — new: partial (`Tasks.tsx:18-23` "Task closed").
- [x] Check box — classic: css:642-647 (17px, radius 5, 1.5px `--line-strong`; hover `--work` border/tick + work-soft) — new: partial (shadcn Checkbox).
- [x] Add a task — classic: tasks.js:24-32, 47-48 (field "New task, Enter to save" → POST `/api/tasks/add {text, session}`) — new: missing.
- [x] Empty text — classic: tasks.js:37 ("This conversation has no open tasks.") — new: partial ("No open task for this session.").

## Search

- [x] Look — classic: search.js:87-120, css:1619-1644 (backdrop `rgb(0 0 0/.28)`, top 14vh; `min(680px)` × `min(560px,72vh)`, radius 14, `--raised`; input 16px with search icon and × "Close (Esc)"; rows 38px, selected `--select`, hover moves selection; no animation on purpose) — new: partial (`SearchPalette.tsx` cmdk dialog `sm:max-w-2xl`, animated).
- [x] Tabs All / Sessions / Archived with counts, Tab / ⇧Tab cycles — classic: search.js:13-17, 63-64, 79-83, 95-98 — new: missing (groups instead).
- [x] Matched words marked — classic: search.js:29-34, css:1640 (title and quote, accent 700) — new: missing.
- [x] Quote near the match — classic: search.js:19-27 — new: missing (start of snippet).
- [x] "archived" tag — classic: search.js:110 — new: partial (icon only).
- [x] ⌘↵ / ⌘-click opens in Claude — classic: search.js:69-78, 106 — new: missing.
- [x] Footer hints — classic: search.js:115-118 ("↑↓ choose", "↵ open", "⌘↵ open in Claude", "Tab tab", "Esc close") — new: missing.
- [ ] Recent sessions when empty, 150 ms debounce, "Searching…", open goes to card — new: done.
- [x] Empty text — classic: search.js:102 ("Nothing found in this tab.") — new: partial ("Nothing found.").

## Dialogs

- [ ] Dialog chrome — classic: css:1033-1042 (border `--line`, radius 14, `--raised`, `min(560px)`, padding 20, `--shadow-pop`; open 160ms opacity + scale(.97) ease-out; backdrop `rgb(0 0 0/.35)`; h2 16px/650) — new: partial (shadcn Dialog).
- [ ] New session folder picker — classic: dialogs.js:69-98, css:1043-1048 (filter field "Filter folders…", ↑/↓ move, first match auto-picked; "Browse…" title "Pick any folder on the Mac with the system picker"; rows 34px with hue swatch, bold name, muted root; selected accent-soft + accent 40% inset ring; "Loading folders…") — new: partial (`NewSessionDialog.tsx:28-54` cmdk, git icon instead of hue swatch, "Other folder…").
- [ ] New session prompt — classic: dialogs.js:99-120 (placeholder "What you want Claude to do (optional) — or dictate it"; ⌘↵ sends; explanation "Send: the first turn runs here, headless, with this mode, model and effort, and the session shows up at once. Open it in Claude when you want." / "Without a prompt, it opens in Claude for you to write there (with Claude's settings)."; "Open in Claude" button; "Send ⌘↵" / "Launching…") — new: partial (`NewSessionDialog.tsx:97-123` no explanation, icon-only submit, no kbd).
- [ ] New session pickers — classic: dialogs.js:108-110 (icons lock/bot/gauge with hints; titles "Permission mode for the first turn", "Model", "Effort for the first turn") — new: partial.
- [ ] New session toasts — classic: main.js:520-531 ("Session created: Claude is working" then opens after 600 ms; "New session opened in Claude") — new: partial ("Session started").
- [ ] Help dialog — classic: dialogs.js:152-166 — new: missing (see Keyboard).
- [ ] Catch me up — classic: dialogs.js:170-256, css:1060-1096 (width min(640px), max-h min(78vh,760px); sun icon `--ask`; "Since Tue 27, 14:20" (`when`, util.js:152); counts as pills (radius 999, waiting ask-soft, stuck bad-soft); "START WITH" focus card accent-soft with accent 35% border; group h3 uppercase 11.5px/700; next pill accent-soft accent; group label "For later"; wait text "Claude reads what your sessions did. It takes about 10 seconds."; footer "A separate request to Claude with your account: it does not open or touch your sessions. It covers what happened since the last summary and what still waits for you."; stale body .5 in 200ms) — new: partial (`DigestDialog.tsx` amber instead of accent, counts as plain text, "Since 2 h", "Later", no footer, shorter wait text).
- [ ] Setup texts — classic: setup.js:14-63, 139 (intro "Each step changes something on this Mac and runs only when you press it. Sessions that were already open load the mod when they restart."; long step texts) — new: partial (`SetupDialog.tsx:23-32` shortened, no intro).
- [ ] Setup step look — classic: css:1521-1547 (card radius 10; done step on `--side`; need badge radius 999, Required accent-soft/accent; working state accent; progress 6px accent; busy "One moment…") — new: partial (rose/amber badges, spinner).
- [ ] Shake waiting cards preference — classic: setup.js:183-188, main.js:89-90 (`ac.shake`, row with Turn on/off) — new: missing.
- [ ] Read aloud row — classic: setup.js:77-103 (long explanation; "Only sessions with the bell"; voice option "System voice (Read & Speak: Siri, if you chose it there)") — new: partial.
- [ ] Setup footer — classic: setup.js:191-194 ("Required steps are missing: without them the board cannot see or answer the sessions." + "Done" primary) — new: partial (text only, no Done).
- [ ] Run dialog — classic: run.js:46-75, css:1273-1290 (label "Command to start **repo**"; hint "Saved for every session of repo. It runs in this session's folder (…). `$PORT` holds a free port."; "Not running."; "Exited with an error (code N)"; Stop danger-text; log on `--side` radius 9 max-h 260; footer "It keeps running after you close this window. Esc close") — new: partial (`RunDialog.tsx` shorter texts, no footer).
- [x] Fork dialog — classic: conversation.js:311-347, css:1269-1271 (title with fork icon "Fork from here"; text "A new session with the whole conversation up to just before this message. Change the message to try another path. The original session does not change."; textarea prefilled, cursor at end; "⌘ ↵ create"; Cancel / "Create session" / "Creating…"; toast "Session forked: it works headless, then moves to Claude"; opens it) — new: missing (known).

## Notifications / PWA

- [ ] Manifest and theme colour — classic: index.html:7-10, manifest.webmanifest (standalone, `#16161a`, icons 192/512/svg) — new: missing (`web/index.html` favicon only).
- [ ] Service worker — classic: main.js:801, sw.js:1-40 (installable; network-first copy of the page for when the server is down; notification click focuses a window and posts `{open:id}`, or opens `/?open=id`) — new: missing.
- [ ] Notification delivery — classic: main.js:219-230 (through `registration.showNotification` with 2 s fallback to `new Notification`; `tag` = id, `renotify: true`, icon `/icon-192.png`) — new: partial (`prefs.ts:42-50` page Notification only; tag = title).
- [ ] Notice body — classic: main.js:213 ("Needs approval to continue" / "Asking you something") — new: partial (`useAlerts.ts:52` "Needs your approval", "Asks you something").
- [ ] Chime, read aloud, bell once, badge — new: done (`features/alerts/*`).
- [ ] Toast look — classic: toasts.js, css:1021-1031 (bottom-right 20px; inverted `--text` bg / `--bg` text; radius 10; 10px 12px 10px 14px; 13px; `--shadow-pop`; enter 220ms translateY(8px) ease-out; max 3) — new: partial (`components/ui/sonner.tsx` popover colours, border, sonner motion).
- [ ] Toast Undo — classic: toasts.js:12, main.js:356-361 (Undo button accent 650 with kbd Z; 7 s with undo, 3.5 s without) — new: partial (sonner action, no Z, default durations).
- [ ] Undo on board actions — classic: main.js:373-414, 424-433 ("Marked as done: …", "Moved to Later: …", "Pinned/Unpinned: …", "Archived: …", "Marked to review: …", "N sessions archived" with Undo) — new: partial (`CardMenu.tsx:16-45` "Done", "Pinned"… without Undo).

## Animations

- [x] Reader slide 420ms `cubic-bezier(0.25,1,0.5,1)` in and out — css:170-176 — new: partial (see Reader).
- [x] Menu pop — css:332-338, 1493-1494 (150ms ease-out, from scale .96 translateY −2px (up menus +4px), origin top-right / bottom-left) — new: partial (Radix zoom-in-95).
- [ ] Dialog 160ms scale .97 — css:1036-1037 — new: partial.
- [ ] Toast 220ms translateY 8px — css:1026-1027 — new: partial.
- [x] Button press scale .97 / icon .92 / choice .96 / option .99 — css:119, 135, 909, 964 — new: partial (translate-y-px).
- [x] Spinner — css:1141 (16px, 2px accent ring, right side transparent, `spin .8s linear`) — new: partial (lucide Loader).
- [x] Shimmer skeleton 1.2s — css:1014-1017 — new: partial (animate-pulse).
- [x] Status dot pulse 1.6s, run dot `run-beat 1.4s`, rec dot 1.2s, waiting blink 1s, plan spin 1s — css:259-260, 1429-1434, 1464-1465, 1478, 974 — new: missing (except an animate-pulse rec dot).
- [x] Mic pill open 260ms — css:1455-1457 — new: missing.
- [x] Chevron turns (150ms file head, 120ms tree, 150ms picker 180°) — css:1213-1214, 1708-1709, 1486-1488 — new: partial.
- [x] Hover reveals (pencil, fork link, code copy .75 → 1) 120ms — css:946-947, 1266-1267, 552-554 — new: missing.
- [ ] Card flash — new: done (`index.css:137-140`).
- [ ] Reduced motion everywhere — css:1138-1140, 326, 1434, 1466, 1832 — new: missing.

## Other

- [x] Storage keys shared with classic — classic: util.js:18-31 (`ac.<key>`) — new: partial (`lib/store.ts` uses `ac.`, but `Sidebar.tsx:20` `sideFolded`, `Changes.tsx:47, 175, 192` `review.<id>` and `changesView`, `CodeWorkspace.tsx:37, 144` `code.<id>` write raw keys: choices do not carry between boards).
- [x] `mark` style — css:484 (ask-soft bg, radius 3, 1px ring) — new: missing (no highlight in use).
- [ ] `.link-btn` — css:1144 (accent, underline offset 2) — new: partial (plain underline-on-hover buttons).
- [ ] Copy handler fallback (execCommand) — util.js:94-107 — new: missing (`Files.tsx:107` clipboard API only).
