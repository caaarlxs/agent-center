# Paridad clásico → React: vistas del tablero

Alcance: vistas Inbox, Board, Tiers y Canvas, y todo lo que se dibuja en ellas.
Rutas clásicas relativas a `public/`. Rutas nuevas relativas a `web/src/`.
Formato: `- [ ] <qué> — classic: <file:line, valores> — new: missing | partial (<diferencia>) | done`.

Leyenda de tokens clásicos (`styles.css:3-81`), usados abajo por nombre:
`--bg #f6f5f2/#0c0c0e`, `--side #efeee9/#0f0f11`, `--surface #fff/#151518`, `--raised #fff/#1c1c20`,
`--hover rgb(0 0 0/.04)|rgb(255 255 255/.04)`, `--press .07`, `--text #1c1c1a/#ededf0`, `--muted #6e6d68/#93939c`,
`--faint #a19f98/#5f5f68`, `--line #e5e3dc/rgb(255 255 255/.07)`, `--line-strong #d6d3ca/rgb(255 255 255/.12)`,
`--accent #c25a32/#e8825a`, `--accent-soft rgb(194 90 50/.1)|rgb(232 130 90/.14)`, `--ask #b45309/#f5b544`,
`--ask-soft`, `--bad #c2410c/#f87171`, `--bad-soft`, `--work #15803d/#4ade80`, `--work-soft`, `--run #ea580c/#fb923c`,
`--run-soft`, `--review #2563eb/#84a9ff`, `--review-soft`, `--select rgb(194 90 50/.08)|rgb(232 130 90/.1)`,
`--shadow 0 1px 2px rgb(0 0 0/.04), 0 4px 16px rgb(0 0 0/.06)` (dark `.3/.25`),
`--shadow-pop 0 8px 32px rgb(0 0 0/.14), 0 1px 3px rgb(0 0 0/.08)` (dark `0 12px 40px rgb(0 0 0/.5), 0 0 0 1px rgb(255 255 255/.06)`),
`--repo-l 42%/70%`, `--radius 10px`, `--ease-out cubic-bezier(0.23, 1, 0.32, 1)`.

---

## Global styles & tokens

- [x] Paleta cálida propia con tokens semánticos — classic: `styles.css:3-81` (lista arriba) — new: missing. `index.css:51-118` usa la paleta gris neutra de shadcn (oklch con croma 0). No existen tokens `--ask`, `--work`, `--review`, `--bad`, `--run`, `--accent`, `--select`, `--shadow`, `--shadow-pop`, `--ease-out`. Los componentes usan colores Tailwind fijos (`amber-400`, `rose-400`, `emerald-400`, `orange-400/500`, `sky-400`). Crea los tokens en `:root` y `.dark` y expónlos en `@theme inline` (p. ej. `--color-ask`, `--color-ask-soft`).
- [x] Tema claro y oscuro según el sistema — classic: `styles.css:44-81` `@media (prefers-color-scheme: dark)` — new: missing. `web/index.html:2` fija `class="dark"`. No hay tema claro funcional.
- [x] Tipografía del sistema, 13px/1.45, antialiased — classic: `styles.css:34,87-94` `font: 13px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased` — new: partial (`index.css:4,10` usa `Geist Variable`; el tamaño base es el de Tailwind, 16px; sin `antialiased`).
- [x] Fuente mono — classic: `styles.css:35` `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace` — new: partial (Tailwind `font-mono` por defecto).
- [x] Anillo de foco — classic: `styles.css:98` `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px }` — new: partial (`index.css:122` `outline-ring/50`, gris).
- [x] Color de repo: algoritmo de tono idéntico — classic: `util.js:124-128` `h = (h*31 + c) % 360` en cada paso — new: partial (`features/session/state.ts:53-57` `h = (h*31+c) >>> 0` y `% 360` al final). Dan tonos distintos para el mismo nombre. Copia el algoritmo clásico.
- [x] Color de repo: espacio de color — classic: punto `hsl(var(--hue) 62% 55%)` (`styles.css:274,814`), texto `hsl(var(--hue) 55% var(--repo-l))` (`styles.css:273`) — new: partial (`SessionCard.tsx:129` `oklch(0.72 0.14 hue)`; el mismo número de tono da otro color en oklch).
- [x] Botón `.btn`: presión y hover — classic: `styles.css:112-127` alto 30px, radio 8px, `transition: background-color 120ms ease, border-color 120ms ease, transform 120ms var(--ease-out)`, `:active scale(0.97)`, `.btn.on { background: var(--text); color: var(--bg) }` — new: partial (shadcn `Button`; sin `scale(0.97)` al pulsar; sin estado `.on` invertido).
- [x] `.icon-btn` 28px, radio 7px, `:active scale(0.92)`, hover `var(--press)` — classic: `styles.css:129-137` — new: partial (shadcn `icon-xs/icon-sm`, sin escala al pulsar).
- [x] Reducción de movimiento global — classic: `styles.css:1138-1140` `*,*::before,*::after { animation-duration: .01ms !important; transition-duration: .01ms !important }` — new: partial (solo el flash, `index.css:140`).

## Scrollbars

- [x] Barra fina con color de tema y sin pista — classic: `styles.css:153-154` `* { scrollbar-width: thin; scrollbar-color: var(--scroll) transparent } *:hover { scrollbar-color: var(--scroll-hover) transparent }`; tokens `--scroll rgb(0 0 0/.16)` / dark `rgb(255 255 255/.13)`, `--scroll-hover .32` / dark `.28` (`styles.css:39-40,77-78`) — new: missing (`index.css` no tiene reglas de scrollbar).
- [ ] Pestañas sin barra — classic: `styles.css:503` `.tabs { scrollbar-width: none }` — new: fuera de alcance (panel).

## Views: Inbox / Board / Tiers / Canvas

- [x] Selector de vistas en la barra lateral y con teclas 1 2 3 4 — classic: `main.js:637-640`, `main.js:144` (`setView` guarda `view` en localStorage, cancela el dibujo de zona), título `main.js:729` (`Board`/`Canvas`/`Tiers`/`Inbox`), enlace `?view=` `main.js:239-241` — new: missing (`app/Sidebar.tsx:95` muestra solo "Canvas", fijo).
- [x] Vista estrecha: el canvas cae a Inbox bajo 860px — classic: `main.js:111-135` — new: missing.
- [x] **Inbox** completa — classic: `board.js:163-220`, CSS `styles.css:347-397` — new: missing. Detalle para implementar:
  - Grupos en orden: `Pinned` (estrella `tone-ask`), luego `COLUMNS` = asking, review, working, pending, parked, done (`util.js:14`), con etiquetas `Asking you`, `To review`, `Working`, `Pending`, `Later`, `Done` y tonos ask/review/work/pending/muted/muted (`util.js:3-10`). Done solo con `showDone`. Un grupo vacío se oculta, salvo `asking`.
  - `Later` plegado por defecto (`board.js:190`). Un grupo plegado se abre si contiene la tarjeta seleccionada.
  - Cabecera `.group-head`: alto 32px, padding 0 8px, 12px, peso 650, `uppercase`, `letter-spacing .04em`, color `--muted`, radio 7px, hover `--hover`; chevron (`chevron`/`down`, 14px) en `--faint`; punto de tono 7px; contador `--faint` peso 500 (`styles.css:351-358`).
  - `Archive all` en Done: `.head-btn` 24px, 11.5px, peso 600, icono archive 13 (`styles.css:362-366`).
  - Vacío: "Nothing is waiting for you. When a session asks you something, it shows up here." con `padding: 10px 12px 14px 38px`, 12.5px, `--faint` (`board.js:216`, `styles.css:359`).
  - Fila `.row`: grid `minmax(0,1fr) auto auto auto`, gap 14px, `min-height 44px`, padding 8px 10px, radio 9px, `transition: background-color 80ms ease`; hover `--hover`; `.selected` fondo `--select`; `.reading` `--select` + `inset 0 0 0 1px var(--accent-soft)` (`styles.css:370-389`).
  - Contenido: StateIcon 24, NewBadge, título 13.5px peso 600 (unread 750, leído 550, `styles.css:929-930`), RepoTag, estrella 11px, Context 1 línea, Meta, edad, Actions a tamaño completo (`board.js:165-186`).
  - Acciones con `opacity 0`, visibles en hover, selección, lectura o `:focus-within`, `transition opacity 120ms` (`styles.css:386-389`).
  - Contenedor estrecho `@container (max-width: 760px)`: oculta meta y acciones (`styles.css:392-397`).
- [x] **Board** por columnas — classic: `board.js:10-161`, CSS `styles.css:399-450, 671-678` — new: missing. Detalle:
  - Grid `grid-auto-flow: column; grid-auto-columns: minmax(270px, 1fr); gap 12px; padding 14px 20px 20px` (`styles.css:401-404`).
  - Columna: fondo `--side`, radio 12px, padding 10px 8px 8px, `transition: background-color/box-shadow/opacity 120ms ease`; h2 12px peso 650 uppercase `.04em` con punto de tono y contador a la derecha (`styles.css:405-412`).
  - Tarjetas agrupadas en "stacks" por repo consecutivo: fondo `hsl(var(--hue) 50% 50% / .07)`, `inset 0 0 0 1px hsl(var(--hue) 50% 50% / .18)`, radio 12, padding 6, gap 6; cabecera con RepoIcon 16 + nombre 12px peso 650 + contador (`board.js:56-75`, `styles.css:672-678`).
  - Arrastre HTML5: `.column.drop { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft) }`, `.is-dragging .column.no-drop { opacity: .55 }`; reglas de destino en `dropAction` (`board.js:46-54`); texto vacío "Drop here" / "Nothing waiting for you" / "Empty" (`board.js:98`).
  - Columna Done solo con `showDone` o durante un arrastre (`board.js:117`); `Archive all` en su cabecera, oculto al arrastrar (`board.js:108-110`).
- [x] **Board** por repo (swimlanes) — classic: `board.js:129-160`, CSS `styles.css:719-740` — new: missing. Control segmentado `Columns`/`By repo` (`main.js:735-738`, `styles.css:742-745`: alto 24px, botón `.on` fondo `--text` y texto `--bg`), tecla `G`. Cabeceras pegajosas (`position: sticky; top: 0; z-index: 4`). Título de carril: alto 36px, 13.5px peso 650, chevron, RepoIcon 18, contador, píldora "N asking you" (`--ask-soft`, radio 9px). Borde izquierdo `3px solid hsl(var(--hue) 55% 50% / .5)`. Carriles plegados guardados en `foldedLanes`.
- [x] Botón "Done" (mostrar terminadas) en Inbox/Board/Tiers — classic: `main.js:745` `data-fly="done"`, título "Show done sessions", `.btn.on` cuando activo; guardado `showDone` — new: missing.
- [x] **Tiers** — classic: `tiers.js:1-78`, CSS `styles.css:680-717` — new: missing. Detalle:
  - Filas: `Main task` (#ef4444), `Fixes` (#f97316), `Searches` (#eab308), `Other` (#22c55e), `Paused` (#64748b, `flex-grow .8`), `Close` (`--faint`, `flex-grow .6`, `min-height 72px`, borde `1.5px dashed var(--line-strong)`). Pistas como `title`: "What matters most right now", "Bugs and corrections", "Look-ups and research", "Everything not sorted yet", "Set aside for later: drop here to pause it", "Drop here to close the conversation".
  - Fila: grid `132px 1fr`, `flex: 1 1 0`, `min-height 96px`, fondo `--side`, radio 12px. Etiqueta: fondo `color-mix(in srgb, var(--tier) 22%, var(--surface))`, título 14px peso 700, contador 12px; iconos check 18 (Close) y pause 16 (Paused).
  - Tarjetas en grid `repeat(auto-fill, minmax(260px, 1fr))`, gap 8, padding 10.
  - Destino: `.tier.drop` anillo accent; `.tier-close.drop { border-color: var(--work); background: var(--work-soft) }`; `no-drop` opacidad .55.
  - Textos vacíos (`tiers.js:35-39`): "Drop here to close it", "N closed · “Done” at the top shows them", "Drag a card here to close it", "Drop here", "Drag a card here to pause it", "Empty".
  - Toast al mover: "`<Tier label>`: `<title>`" (`main.js:421`). Teclas `[` y `]` (`main.js:641-647`). Responsive bajo 860px (`styles.css:712-717`).
- [ ] **Canvas** — new: partial (existe; ver secciones Canvas, Zones, Notes, Done strip y Zoom).

## Card (tarjeta de sesión)

Tarjeta del canvas `.ccard` (`canvas.js:84-160`, `styles.css:789-898`) frente a `features/session/SessionCard.tsx`.

- [x] Caja base — classic: `styles.css:790-797` ancho 288px, padding `11px 12px 10px`, fondo `--surface`, borde `1px var(--line)`, radio 12px, sombra `0 1px 2px rgb(0 0 0/.06)`, gap 8px, `cursor: grab`, `user-select: none` — new: done (`SessionCard.tsx:109` w-72, p-3, rounded-xl, shadow-sm, gap-2; radio 14px en vez de 12px).
- [x] Transición de tarjeta — classic: `styles.css:796` `transition: left 340ms var(--ease-out), top 340ms var(--ease-out), border-color 120ms ease, box-shadow 120ms ease, opacity 200ms ease` — new: partial (`transition-colors`; la posición salta sin deslizar cuando el servidor la cambia).
- [x] Hover — classic: `styles.css:824` `z-index: 20` en hover; `847` pausa la animación; tarjetas `.card` del Board: `border-color: var(--line-strong); box-shadow: var(--shadow)` (`styles.css:446`) — new: partial (`hover:border-white/15`; sin subir z-index ni sombra).
- [x] Seleccionada / leyendo — classic: `styles.css:803` `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft)` — new: done (`SessionCard.tsx:113` `border-orange-400/70` + `0 0 0 3px rgb(251 146 60/.15)`; usa naranja Tailwind en vez de accent).
- [x] No leída: borde azul con halo — classic: `styles.css:925-928` `.ccard.unread:not(.selected,.reading,.picked,[class*=urgent-]) { border-color: color-mix(in srgb, var(--review) 75%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--review) 30%, transparent), 0 0 16px color-mix(in srgb, var(--review) 20%, transparent) }` — new: missing (solo el punto).
- [x] Punto de no leída — classic: `canvas.js:138`, `styles.css:808` 7px, `margin-top: 6px`, `--accent`, title "New since you last looked" — new: done (`SessionCard.tsx:120`, 8px `bg-orange-400`).
- [x] Título — classic: `styles.css:807` 14px, peso 600, `line-height 1.3`, 2 líneas, `title=` con el texto (`canvas.js:136`); en Done peso 550 (`styles.css:896`) — new: partial (`SessionCard.tsx:118` `font-medium` 500, `leading-snug` 1.375; sin `title`).
- [x] Estrella de fijada — classic: `canvas.js:137` icono star 12px, color `--ask`, `margin-left: auto`, title "Pinned" — new: partial (`SessionCard.tsx:119` estrella rellena ámbar 14px; sin `title`).
- [x] Línea de contexto "Now:" al trabajar — classic: `components.js:102-103` `<span>Now:</span>` en `--work`, peso 600 (`styles.css:302`) — new: missing (`state.ts:30-34` devuelve el texto sin prefijo).
- [x] Pregunta en `--text` peso 500 — classic: `styles.css:301,810-811`, 12.5px/1.4 — new: done (`SessionCard.tsx:124`).
- [x] Tarjeta Done sin contexto ni señales — classic: `canvas.js:140,144` — new: n/a (el canvas nuevo no dibuja tarjetas Done; ver Done strip).
- [x] Respuestas rápidas con estilo "ask" — classic: `styles.css:902-911` `.choice` alto 26px (24px en canvas, `styles.css:811`), radio 13px, 12px peso 600, borde `color-mix(var(--ask) 45%)`, color `--ask`, fondo `--ask-soft`; la primera `background: var(--ask); color: var(--surface)`; `:active scale(.96)`; hover `color-mix(var(--ask) 22%)` o `brightness(1.08)`; `transition: transform 120ms var(--ease-out), background-color 120ms ease` — new: partial (`SessionCard.tsx:44` botones shadcn `default`/`outline` neutros, sin color ask, sin escala).
- [x] Respuestas: casos de reserva — classic: `components.js:159-165` botón "Reply" (pregunta con varias partes, abre el lector) y "Answer in Claude ↗" con title "You can answer this session only in Claude desktop" — new: missing (`SessionCard.tsx:31-40` devuelve nada en esos casos).
- [x] Respuestas: plantilla que termina en ":" o "…" va al campo de respuesta — classic: `main.js:501-506` — new: missing (`sendMessage` envía siempre).
- [x] Toasts de respuesta — classic: `main.js:510` "Replied: “<60 chars>”" o "Reply queued: it arrives when the session is free"; `components.js:135` "Allowed"/"Denied"; `156` "Answer sent" — new: partial ("Reply sent", "Allowed", "Denied", "Answer sent").
- [x] Pie: repo con tooltip `repo · branch` y edad — classic: `canvas.js:141-143`, `styles.css:812-815` 11.5px `--faint`, gap `4px 8px` — new: done (`SessionCard.tsx:127-131`).
- [x] Edad en meses — classic: `util.js:139` `"N mo"` desde 30 días — new: missing (`state.ts:43-50` sin meses).
- [x] Edad con urgencia — classic: `styles.css:667-669` `.urgent-low .age { color: #ca8a04 }`, `.urgent-mid .age { color: #ea580c; font-weight: 600 }`, `.urgent-high .age { color: var(--bad); font-weight: 650 }`; umbrales `components.js:23-27` (<10 min low, 10–30 mid, >30 high) — new: missing.
- [x] Borde de urgencia — classic: `styles.css:664-666` `.card.urgent-low { border-color: rgb(234 179 8/.45) }`, `urgent-mid rgb(249 115 22/.55)`, `urgent-high color-mix(var(--bad) 60%) + background color-mix(var(--bad) 6%, var(--surface))` — new: missing.
- [x] Borde de "asking"/"permission" — classic: `styles.css:843-844` `color-mix(in srgb, var(--ask) 50%, var(--line))` y `color-mix(var(--bad) 55%, var(--line))` — new: partial (`SessionCard.tsx:110-111` `border-amber-400/40` y `border-rose-400/40` con halo fijo de 3px que no existe en el clásico).
- [x] Brillo "respira" de la tarjeta que trabaja — classic: `styles.css:838-842` `.ccard.state-working::after { inset: -3px; border-radius: 14px; box-shadow: 0 0 0 2px var(--work-soft), 0 0 14px var(--work-soft); animation: breathe 2.6s ease-in-out infinite }`, `@keyframes breathe { 0%,100% { opacity: .25 } 50% { opacity: 1 } }` — new: missing.
- [x] Opacidad por estado — classic: `styles.css:834-837` pending `.8`, parked `.55`, hover 1; done `.62` sin sombra (`894-895`) — new: partial (`SessionCard.tsx:112` `opacity-75` para ambos).
- [x] Color del usuario (tinte) — classic: `styles.css:455-466` `[data-color]` lilac #8b5cf6, blue #3b82f6, teal #14b8a6, green #22c55e, yellow #eab308, orange #f97316, pink #ec4899; `.ccard[data-color] { border-color: color-mix(var(--tint) 45%, var(--line)); background: color-mix(var(--tint) 9%, var(--surface)); box-shadow: inset 3px 0 0 var(--tint), 0 1px 1px rgb(0 0 0/.02) }`; fila `styles.css:467-469` — new: missing (sin `data-color`, sin acción `color` en `actions.ts:38`).
- [x] Menú de color — classic: `components.js:240-270`, `styles.css:471-480` título "Colour", círculos 22px, hover `scale(1.12)` 100ms, actual con `border-color: var(--text); box-shadow: inset 0 0 0 2px var(--raised)`, "ninguno" con borde `1.5px dashed`; títulos "Lilac (1)"…"Pink (7)", "No colour (0)" — new: missing.
- [x] Barra flotante de acciones — classic: `components.js:272-319`, `styles.css:825-831` `position: absolute; top: -12px; right: 8px; padding: 1px; fondo --raised; borde --line; radio 8px; sombra --shadow; opacity 0 → 1 en hover/selección, transition opacity 120ms`; botones compactos 24px, iconos 14px (`styles.css:438-439`) — new: partial (`SessionCard.tsx:121` un botón "…" con DropdownMenu, solo en nivel near).
- [x] Acciones y títulos con su tecla — classic: `components.js:278-317` "Open in Claude (O)", "Pin (P)"/"Unpin (P)", campana "Tell me when it finishes or asks me something" / "You will hear when it finishes or asks you: click to stop", "Run: start this session's project", "Colour (C)", "Mark to review: back to “To review”, as if you had not opened it (U)" (solo pending), "Stop the running turn (S)" (solo working, hover `--bad`), "Later (A)" / "Remove from Later (A)", "Mark as done (E)" / "Reopen (E)", "Archive: it leaves the board until the session moves again" — new: partial (`CardMenu.tsx:28-45` tiene Open, Pin, watch, Run, Later, Done/Reopen, Archive; faltan Colour, Mark to review, Stop y las teclas).
- [x] Estado "on" de los iconos — classic: `styles.css:136` `.icon-btn.on { color: var(--accent) }` para pin, campana, run, menús abiertos; `.icon-btn.tinted { color: var(--tint) }` — new: missing.
- [x] Menú "Later" con teclas y horas — classic: `components.js:221-238`, `util.js:162-168` título "Later, until…", filas "1 hour"(1), "This afternoon" 16:00 (2), "Tomorrow morning" 9:00 (3), "Monday" 9:00 (4), "No date" (5); pista en `--faint` 12px con `kbd` — new: partial (`CardMenu.tsx:36-39` submenú sin horas ni teclas).
- [x] Animación de menú — classic: `styles.css:332-338` `transition: opacity 150ms, transform 150ms var(--ease-out); @starting-style { opacity: 0; transform: scale(.96) translateY(-2px) }`, `transform-origin: top right`, radio 10px, `--shadow-pop`, padding 5px, filas 30px — new: partial (animación de Radix/shadcn).
- [x] Toasts de acción con nombre y deshacer — classic: `main.js:374,413` "Marked as done: <title>", "Moved to Later: <title>", "Pinned: <title>", "Unpinned: <title>", "Archived: <title>", "Marked to review: <title>" con Undo (acción inversa) — new: partial (`CardMenu.tsx:16-19` "Done", "Pinned", "Archived", "Later: 1 hour"…, sin título, sin Undo).
- [x] Cambios optimistas — classic: `main.js:274-287,363-414` el parche se aplica al instante y dura hasta que el servidor coincide o pasan 6000 ms — new: missing (la tarjeta espera al servidor).
- [x] Señales del pie — classic: `canvas.js:144-156`, `styles.css:816-822` alto 20px, padding 0 5px, 11px, fondo `--hover`; solapamiento, fondo y overlap muestran solo icono y número (`font-size: 0` en el texto) — new: partial (`SessionCard.tsx:65-95`). Faltan:
  - `OverlapChip` (`components.js:324-334`): icono alert, `--ask`/`--ask-soft`, title "It may step on another session:\n…\n\nClick to open it", clic abre la otra sesión.
  - `BackgroundChip` (`components.js:353-361`): punto naranja con latido `run-beat 1.4s ease-out infinite` (`styles.css:1429-1434`: `0% { box-shadow: 0 0 0 0 color-mix(var(--run) 60%) } 70%,100% { 0 0 0 6px transparent }`), color `--run`, fondo `--run-soft`, title "Running now:\n• …".
  - `MemoryChip` (`components.js:422-433`): desde 1 GB, naranja; rojo desde 3 GB (`.mem-chip.high`), icono gauge, clic abre el lector.
  - PR: color por estado (`styles.css:288-291` open `--work`, draft `--muted`, merged #8b5cf6, closed `--bad`), marca de checks ✓ ✗ • en peso 800 (`components.js:121,127`), clic abre la pestaña PRs. New: solo tiñe por checks, sin clic.
  - Varias PR y tareas: clic abre las pestañas `prs` / `tasks` (`canvas.js:150-153`). New: sin clic.
  - `PendingChip` (`components.js:437-444`): rojo "N undelivered" cuando la sesión no despierta. New: siempre ámbar.
  - `UsageMeter` (`components.js:186-195`): barra 22px en canvas, tonos ok/ask/bad (65 %, 85 %), title "Context used: Nk of Wk tokens (P%) — consider starting a new session". New: partial (title corto).
- [x] StateIcon: forma y tamaños — classic: `components.js:59-76`, `styles.css:306-326` círculo con fondo `--tone-soft`, icono 55 % del tamaño; anillo `r 15.5`, `stroke-width 3.5`, pista `--work-soft`, relleno con `transition: stroke-dasharray 500ms var(--ease-out)`, giro `spin-ring 1.6s linear infinite` sin progreso; núcleo 7px; con tamaño ≥26 muestra "done/total" 9.5px peso 750 — new: partial (`StateIcon.tsx:24-43` r 15, trazo 4, `animate-spin` 1 s, núcleo 6px, sin "done/total").
- [x] StateIcon: tonos — classic: `styles.css:312-317` pending `color-mix(var(--review) 55%, var(--faint))` sobre `--hover`; stale y parked en `--faint` sobre `--hover` — new: partial (`StateIcon.tsx:10-19` stale naranja, pending zinc).
- [x] StateIcon: textos — classic: `components.js:44-51,62` etiqueta "Pending", "Interrupted" para sesiones interrumpidas; title "Working: step X of Y · <current>" — new: partial (`state.ts:22` "Idle"; sin "Interrupted"; sin "· current").
- [x] Insignia "New" / "Asks you" / "Approval" (Board e Inbox) — classic: `components.js:337-342`, `styles.css:917-924` alto 17px, radio 5px, fondo `--review` (ask `--ask`, permission `--bad`), 10px peso 750 uppercase `.05em` — new: missing.
- [x] Tarjeta del Board `.card` — classic: `board.js:12-44`, `styles.css:416-450` StateIcon 30, h3 14px 2 líneas, sub-línea repo/branch mono/edad, NewBadge, pin con title "Pinned: it shows first in its column", Context, Meta completa, Actions compactas en `top: 4px; right: 4px`; `.col-asking .card` borde `color-mix(var(--ask) 35%, var(--line))` — new: missing (no hay Board).
- [x] Meta completa (Board/Inbox) — classic: `components.js:197-217` etiquetas "headless", "needs approval", PRs, "N tasks", pendientes, "until <when>"/"no date" en Later, "worktree", "archived in Claude desktop", uso — new: missing.
- [x] Vista previa "peek" — classic: `canvas.js:162-181`, `styles.css:1825-1841` tras 450 ms, ancho 340px, al lado de la tarjeta sin pisar el panel, `--raised`, borde `--line-strong`, radio 12, `--shadow-pop`, `animation: peek-in 160ms var(--ease-out)` (`from { opacity: 0; transform: translateY(4px) scale(.98) }`); "You" + último prompt (3 líneas), texto actual (8 líneas, `--ask` si pregunta), "Step X of Y", pie con repo, rama mono y edad; se cierra al hacer scroll o arrastrar; no sale para la sesión abierta — new: partial (`SessionCard.tsx:105,136-141` HoverCard 450 ms, ancho 320px; falta el pie repo/rama/edad; sale también durante el arrastre y para la sesión abierta).

## Canvas

- [x] Fondo de puntos en la rejilla de 24px — classic: `styles.css:754-758` `radial-gradient(circle, var(--line) 1px, transparent 1.2px); background-size: 24px 24px; background-position: 12px 12px` sobre `--bg` — new: partial (`components/ai-elements/canvas.tsx:23` `<Background bgColor="var(--sidebar)" />`, separación por defecto 20px, no 24px).
- [x] Zona "Incoming" — classic: `canvas.js:981-983`, `styles.css:760-766` rectángulo `1.5px dashed var(--line-strong)`, radio 14px, sin eventos; etiqueta "INCOMING" en `top: -10px; left: 14px; padding: 0 8px; background: var(--bg); 11px; peso 700; uppercase; letter-spacing .06em; --faint`; tamaño `ENTRY.cols * (CARD_W+GRID)` × `entryH + 12` — new: missing.
- [x] Inclinación al arrastrar una tarjeta — classic: `canvas.js:101` `rotate(1.5deg)`; `.ccard.dragging { z-index: 30; cursor: grabbing; box-shadow: var(--shadow-pop); transition: none; animation: none }` (`styles.css:802`) — new: missing.
- [x] Destacar la tarjeta destino al arrastrar una nota — classic: `canvas-notes.js:68-73`, `styles.css:1183` `.ccard.note-target { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft) }` — new: missing.
- [x] Notas adjuntas siguen a la tarjeta durante el arrastre — classic: `canvas-notes.js:18-30` `follow()` en cada movimiento — new: partial (`Canvas.tsx:111-118` la nota se recoloca al soltar).
- [x] Caja de selección con estilo accent — classic: `styles.css:1313-1316` borde `1.5px solid var(--accent)`, fondo `color-mix(var(--accent) 12%)`, radio 4px; se dibuja con arrastre simple sobre el vacío (`canvas.js:600-635`) — new: partial (React Flow: arrastre con Shift y estilo azul por defecto).
- [x] Elemento elegido — classic: `styles.css:1317-1318` `.ccard.picked { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft) }`, `.note.picked { box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 1.5px var(--accent) }` — new: partial (tarjetas: done vía `selected`; notas: sin anillo).
- [x] ⌘/⇧-clic elige sin abrir — classic: `canvas.js:127` — new: partial (`Canvas.tsx:224` `onNodeClick` abre la sesión siempre).
- [x] Esc suelta la selección — classic: `canvas.js:900` — new: missing.
- [x] Clic en el vacío cierra el panel y suelta la tarjeta — classic: `main.js:535-545` (excepto `.reader, .card, .ccard, .note, .row, .menu, dialog, .toasts, button, a, input…`) — new: missing (sin `onPaneClick`).
- [x] Suelta sobre una carpeta: la tarjeta entra — classic: `canvas.js:795-828` vuela hacia la carpeta (`translate + scale(0.3)`, opacidad 0, 200 ms, `cubic-bezier(0.22,1,0.36,1)`); la carpeta da un golpe (`scale(1.05)` en offset .6, 300 ms, delay 120 ms); toast "Added to <zone>" / "N added to <zone>"; la carpeta bajo el puntero se marca `.zone.folder.drop { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 4px var(--accent-soft) }` (`styles.css:1602`) — new: missing.
- [x] Doble clic en el vacío crea una nota — classic: `canvas.js:974-980` — new: done (`Canvas.tsx:217-220`).
- [x] Teclas Delete/Backspace — classic: no borran nada — new: partial/riesgo (`components/ai-elements/canvas.tsx:11,15` `deleteKeyCode=["Backspace","Delete"]` quita nodos del estado local vía `applyNodeChanges`). Pon `deleteKeyCode={null}`.
- [ ] Lienzo con límites — classic: `canvas.js:752-757` el lienzo ocupa la ventana; tarjetas y zonas no salen ni bajan de Done (`canvas.js:252-260,829-832`) — new: partial (lienzo infinito de React Flow; decisión de diseño, documéntala). Decisión: el lienzo abierto de React Flow se queda; "Done" es una banda fija al pie de la vista y "Fit" ajusta lo que queda por encima de ella.
- [x] Minimapa — classic: no existe — new: extra (`Canvas.tsx:233-234`). Mantén o quita según el dueño. Quitado: el clásico no lo tiene y tapaba la banda Done.

## Zones

- [x] Estilo de zona — classic: `styles.css:768-781` radio 14px, `background: hsl(var(--hue) 55% 50% / .035)`, `box-shadow: inset 0 0 0 1px hsl(var(--hue) 55% 50% / .28)`, `cursor: grab` — new: partial (`ZoneNode.tsx:52` oklch .04/.3, `rounded-2xl` = 18px).
- [x] Zona arrastrada — classic: `styles.css:772,777` `z-index: 2; box-shadow: inset 0 0 0 2px hsl(var(--hue) 55% 50% / .6), var(--shadow-pop)`, `cursor: grabbing` — new: missing.
- [x] Cabecera — classic: `styles.css:773-776` alto 34px, padding `0 6px 0 14px`, peso 700, 13px, color `hsl(var(--hue) 55% var(--repo-l))`; title "Drag to move the zone · double-click to rename" (`canvas.js:346`) — new: partial (`ZoneNode.tsx:55,62` `px-3 pt-2`, semibold, `oklch(0.8 0.12 hue)`, title solo en el nombre).
- [x] Campo de nombre — classic: `styles.css:779` fondo `--surface`, borde `1px solid var(--accent)`, radio 6px, padding 2px 6px; Enter guarda, Esc descarta, blur guarda, máx. 60 — new: done (`ZoneNode.tsx:57-61`; fondo `bg-black/30` sin borde accent).
- [x] Botones plegar y quitar — classic: `canvas.js:355-358`, `styles.css:780-781,1616-1617` 22px, `opacity 0` → 1 en hover de la zona; iconos `shrink` y `x` 13px; títulos "Fold into a folder (its cards stay where they are)" y "Remove the zone (the cards stay)" — new: done (`ZoneNode.tsx:63-66`; title de plegar más corto).
- [x] Esquina de redimensión siempre visible — classic: `canvas.js:360`, `styles.css:782-787` `right: 2px; bottom: 2px; width/height: calc(20px * var(--unscale))` (mismo tamaño en pantalla con cualquier zoom), `cursor: nwse-resize`, `border-radius: 0 0 12px 0`, `background: linear-gradient(135deg, transparent 50%, hsl(var(--hue) 55% 50% / .5) 50%)`, title "Resize"; mínimo 160×120; ajuste hacia abajo a la rejilla (`floor(w/24)*24`) — new: partial (`ZoneNode.tsx:53-54` NodeResizer solo con la zona seleccionada, mínimo 240×160, `round`).
- [x] Dibujar una zona con el ratón — classic: `canvas.js:649-695,998-999,1025`, `main.js:739-741` el botón "Zone" pasa a `.on` y una capa `cursor: crosshair` toma el siguiente arrastre; borrador `.zone-draft`; un clic crea el tamaño estándar (`CARD_W*2+GRID*3` × `CARD_H*2+GRID*2`, `canvas-layout.js:45-57`); aviso "Drag to draw the zone · Esc to cancel" (`styles.css:1325-1328`: centrado arriba, 12px, `--surface`, `--shadow-pop`, radio 8); Esc o volver a pulsar cancela; title del botón "Draw a named zone on the canvas to group cards (Esc cancels)" — new: partial (`Canvas.tsx:184-189` crea una zona fija en el centro).
- [x] Plegar con animación — classic: `canvas.js:286-300` cada tarjeta vuela a la carpeta (`translate + scale(0.35)`, opacidad 0, 240 ms, retraso `i*18 ms`, `cubic-bezier(0.22,1,0.36,1)`); la zona se recorta con `clip-path inset(... round 14px)` en 260 ms; se guarda al terminar; al llegar, `scale(.96) → none` 220 ms (`309`) — new: missing.
- [x] Desplegar con animación — classic: `canvas.js:312-324` clip-path inverso 300 ms; tarjetas salen de la carpeta 320 ms con retraso `40 + i*22 ms`; la zona sube o va a la izquierda si no cabe (`279-285`) — new: missing.
- [x] Carpeta (zona plegada) — classic: `canvas.js:326-343`, `styles.css:1596-1617` ancho 288px, `min-height 96px`, fondo `color-mix(in srgb, hsl(var(--hue) 55% 50%) 12%, var(--surface))`, `box-shadow: inset 0 0 0 1.5px hsl(var(--hue) 55% 50% / .5), 0 1px 2px rgb(0 0 0/.08)`; title "Click to unfold · drag to move it · drop a card on it to add it" — new: partial (`ZoneNode.tsx:43-50` tarjeta neutra `bg-card`, title "Click to unfold"). Faltan:
  - contador en píldora 20×18, radio 9, fondo `hsl(var(--hue) 55% 50% / .18)`, 11px;
  - botón "Unfold" (icono expand 13);
  - estados como píldoras sólidas alto 19px, radio 5, peso 600, texto `--surface`, fondos `--ask` / `--bad` / `--work` / `--review`, textos "N asks you", "N approval", "N working", "N new" (new usa texto coloreado, "ask you", y "new" en naranja en vez de azul);
  - iconos de estado (máx. 9, new usa 10) como botones que abren la sesión, hover `box-shadow: 0 0 0 2px var(--accent-soft)`; "+N" 11.5px `--muted`.
- [ ] Nombre de zona legible al alejar — classic: `styles.css:1817` `calc(13px * min(var(--unscale), 2.2))` — new: done (`ZoneNode.tsx:33,57,62`).

## Notes

- [x] Colores y caja — classic: `styles.css:1149-1160` colores `--note` yellow #eab308, pink #ec4899, blue #3b82f6, green #22c55e; `background: color-mix(in srgb, var(--note) 16%, var(--surface))`; `border: 1px solid color-mix(var(--note) 45%, var(--line))`; radio 10px; sombra `0 1px 2px rgb(0 0 0/.08)`; `transition: box-shadow 120ms, left/top 340ms var(--ease-out)` — new: partial (`NoteNode.tsx:20-22,31` pasteles opacos `bg-amber-200/90 text-amber-950`…, `rounded-md`, `shadow-lg`; no siguen el tema).
- [x] Cabecera — classic: `styles.css:1163-1167,1184-1191` alto 22px, padding `0 4px 0 8px`, `border-radius: 9px 9px 0 0`, fondo `color-mix(var(--note) 28%)` (adjunta 40%), `cursor: grab`; title "Drag to move the note; drop it next to a card to attach it" o "Attached to “<title>”: it moves with the card. Drag it away to detach it" — new: partial (`NoteNode.tsx:34` alto 20px, sin fondo propio, sin title).
- [x] Punto de color — classic: `styles.css:1168` 11px, color sólido `var(--note)`, title "Change the colour", a la izquierda — new: partial (`NoteNode.tsx:35-36` `currentColor` al 25 %, a la derecha, title "Colour: <next>").
- [x] Icono de enlace en nota adjunta — classic: `canvas-notes.js:148`, `styles.css:1187` icono link 11px, color `color-mix(var(--note) 70%, var(--text))` — new: missing (solo `ring-1 ring-black/10`).
- [x] Contador de casillas "2/5" — classic: `canvas-notes.js:149`, `styles.css:1188` 11px peso 650 `--muted` tabular — new: missing.
- [x] Botón "Add a checkbox" — classic: `canvas-notes.js:134-138,151` icono tasks 12px, añade `- [ ] ` y abre la edición — new: missing.
- [x] Botones con `opacity 0` → 1 en hover o foco — classic: `styles.css:1169-1170,1189-1190` 18px — new: partial (`NoteNode.tsx:37` X siempre al 50 %).
- [x] Texto — classic: `styles.css:1171-1175,1191` 13px/1.45, padding `7px 10px 12px`; placeholder "Write a note… (- [ ] for a checkbox)"; `spellcheck=false` — new: partial (`NoteNode.tsx:40` `px-2.5 pb-2`, `leading-snug`, placeholder "Write a note…").
- [x] Enter continúa la lista; Enter en casilla vacía la termina — classic: `canvas-notes.js:121-133` — new: missing.
- [x] Casilla hecha — classic: `styles.css:1195-1196` texto `--faint` tachado; `accent-color: color-mix(var(--note) 80%, var(--text))` — new: partial (`NoteNode.tsx:46` tachado + `opacity-60`, sin accent-color).
- [x] Nota arrastrada — classic: `canvas-notes.js:78` `rotate(-1deg)`; `styles.css:1161` `z-index: 31; box-shadow: var(--shadow-pop)` — new: missing.
- [x] Foco — classic: `styles.css:1162` `z-index: 24; box-shadow: 0 0 0 2px color-mix(var(--note) 55%, transparent)` — new: missing.
- [x] Esquina de redimensión — classic: `canvas-notes.js:158`, `styles.css:1176-1180` 16px × `--unscale`, `linear-gradient(135deg, transparent 50%, color-mix(var(--note) 60%) 50%)`, radio `0 0 8px 0`; mínimo 144×96, máximo 800×800, ajuste `floor` a 24px — new: partial (`NoteNode.tsx:32-33` NodeResizer solo con selección, mínimo 140×80, sin ajuste a la rejilla, sin máximo).
- [x] Nota nueva — classic: `canvas-notes.js:163-177` siempre amarilla, 216×144; con doble clic en `(x-24, y-12)`; con el botón, a la derecha de Incoming con desfase `(n % 5) * 24`; el foco va al texto — new: partial (`notes.ts:39-41` color rota por cantidad; centrada en el punto).
- [ ] Borrar con deshacer — classic: `canvas.js:637-641` toast "Note deleted" con Undo — new: done (`Canvas.tsx:89-93`).
- [x] Botón "Note" — classic: `main.js:742-744` title "Add a note (or double-click the empty canvas)" — new: partial (`Canvas.tsx:229` sin title).

## Done strip

- [x] Banda "Done" dentro del lienzo — classic: `canvas.js:1001-1015`, `styles.css:861-874` franja al pie, alto `48 + 144`; `border-top: 1.5px dashed var(--line-strong)`; fondo `color-mix(var(--side) 55%, transparent)`; `transition: background-color 150ms, border-color 150ms`; cabecera alto 40px, padding 0 16px, 12px peso 700 uppercase `.05em` `--muted`, icono check 14, contador `--faint` — new: partial (`DoneDock.tsx:19-31` panel flotante centrado, radio xl, borde dashed, `text-xs font-semibold`, sin mayúsculas).
- [x] Texto guía — classic: `canvas.js:1004` con tarjetas "Drop a card here to mark it as done · lift it out to reopen it", sin tarjetas "Drop a card here to mark it as done"; `.done-hint` 12px peso 450 `--faint`, `--work` al soltar — new: partial (`DoneDock.tsx:23` "Drop a card here to mark it done" solo sin tarjetas).
- [ ] Destino al soltar — classic: `styles.css:866,873` `background: var(--work-soft); border-color: var(--work)` — new: done (`DoneDock.tsx:21` emerald).
- [x] Tarjetas Done como tarjetas atenuadas — classic: `canvas.js:1007-1011`, `styles.css:894-896` una fila de tarjetas completas, `opacity .62`, sin sombra, título 550; hover/selección 1 — new: missing (chips con título).
- [x] Sacar una tarjeta de Done la reabre — classic: `canvas.js:833-838` la deja donde cae y llama `undone`; soltada otra vez en Done vuelve a su hueco con 280 ms `cubic-bezier(0.22,1,0.36,1)` (`772-778`) — new: missing (las chips no se arrastran).
- [x] Mosaico "+N more done" y su lista — classic: `canvas.js:364-384,1012-1014,1026`, `styles.css:876-893` mosaico 72px, `1.5px dashed`, radio 12, número 20px; `.on` y hover borde accent; lista 420px, `max-height min(60%, 520px)`, `--raised`, `--shadow-pop`; cabecera "N more done"; filas con título + "repo · age", botón "Reopen: back on the canvas" (undo) y "Archive"; se cierra con clic fuera o Esc — new: missing (todas las chips en línea con scroll horizontal).
- [x] "Archive all" con deshacer — classic: `canvas.js:1005`, `main.js:424-433` toast "1 session archived" / "N sessions archived" con Undo (unarchive) — new: partial (`DoneDock.tsx:16-17` "N archived", sin Undo).
- [x] Dock al hacer zoom — classic: `canvas.js:1019-1023`, `styles.css:1301-1310` barra fija 44px, `backdrop-filter: blur(6px)`, fondo `color-mix(var(--side) 92%)`, chips 200px máx.; texto "Drop here to mark it as done" — new: partial (el panel nuevo hace este papel siempre).
- [ ] Destino `data-fly="done"` con pulso al llegar — classic: `canvas.js:1002`, `motion.js:155-168` — new: missing.

## Zoom & navigation

- [x] Control de zoom "− % + Fit" — classic: `canvas.js:1027-1032`, `styles.css:1293-1300` arriba a la derecha (`top: 10px; right: 14px; z-index: 35`), `--raised`, borde, radio 9px, `--shadow`, padding 2px, gap 2px; botones 26px con "−" y "+" 16px peso 600; porcentaje `min-width 44px`, 12px peso 600 `--muted` tabular; "Fit" `.btn subtle` 26px 12px; desactivados al límite con `opacity .35`; "Fit" desactivado cuando ya ajusta; title "Zoom: pinch on the trackpad or ⌘ + wheel · keys + − 0. Zooming out gives more room" — new: partial (`Canvas.tsx:232` Controls de React Flow abajo a la izquierda: +, −, fit, candado; sin porcentaje, sin title).
- [x] Pasos y límites — classic: `canvas.js:16-17,853-862` paso ×1.2, máximo 1.5, mínimo 0.4 (o el ajuste si es menor); el zoom se para en "Fit" al cruzarlo; ancla en el cursor — new: partial (`Canvas.tsx:225` 0.3–1.6).
- [x] Zoom guardado — classic: `canvas.js:429-430` `canvasZoom` en localStorage; `null` = ajustar a la ventana — new: missing (`fitView` solo al iniciar).
- [x] Niveles de detalle (semantic zoom) — classic: `canvas.js:20` far < 0.62, mid < 0.85, near; CSS `styles.css:1809-1817`: mid: contexto 1 línea, oculta etiquetas salvo overlap y el uso; far: `gap 6px; padding 12px 14px`, oculta contexto que no pregunta, respuestas, edad y señales, pregunta en 2 líneas a `12.5px*min(unscale,1.8)`, título `14px*min(unscale,2)` alto de línea 1.2, icono `22px*min(unscale,1.8)`, pie `11.5px*min(unscale,1.8)` — new: partial (`Canvas.tsx:32` mid < 0.9; `SessionCard.tsx:117-133`: en mid oculta respuestas y señales, que el clásico muestra; en far oculta la pregunta, que el clásico muestra en 2 líneas; padding far no cambia).
- [x] Pellizco y ⌘ + rueda hacen zoom; la rueda sola desplaza — classic: `canvas.js:875-890` — new: done (React Flow `zoomOnPinch` + `panOnScroll`).
- [x] Espacio + arrastre o botón central desplaza; cursor `grab`/`grabbing` — classic: `canvas.js:893-898,947-967`, `styles.css:752,1321` — new: partial (React Flow desplaza con arrastre simple; el arrastre simple ya no dibuja la caja).
- [x] Ir a una tarjeta ("Next up") con destello — classic: `canvas.js:921-945`, `styles.css:1820-1822` `flash 1.4s var(--ease-out)` `0% { box-shadow: 0 0 0 0 color-mix(var(--accent) 70%) } 100% { 0 0 0 18px transparent }` — new: done (`Canvas.tsx:199-213`, `index.css:137-140`, color naranja fijo).
- [x] Desplazamiento en el borde al arrastrar — classic: `canvas.js:47-74` 48px, 14 px/frame — new: done (auto-pan de React Flow).
- [x] "Next up" — classic: `main.js:746-748` badge `--ask` con texto `--surface` 18px (`styles.css:1647-1650`), `kbd` al 70 %; title "Open what waits for you next: N (approvals, questions, then what is new) · F" / "Nothing waits for you · F"; toast "Nothing else waits for you" si solo queda la abierta (`main.js:484`) — new: partial (`App.tsx:71-76` badge `bg-orange-500`, title corto, sin el segundo toast).

## Keyboard shortcuts

Clásico: `main.js:552-658` y `canvas.js:891-912`. Nuevo: `app/App.tsx:51-60`, `SessionPanel.tsx:28-35`.

- [ ] `⌘K` / `/` buscar — classic: `main.js:557-563` — new: done.
- [ ] `F` Next up — classic: `main.js:650` — new: done.
- [x] `?` ayuda (también Shift+/) — classic: `main.js:559` — new: missing.
- [x] `j` / `↓`, `k` / `↑` mover la selección en el orden de la vista; el foco sigue y hace `scrollIntoView({block:"nearest"})`; con el panel abierto cambia la sesión — classic: `main.js:595-614`; orden del canvas: arriba-abajo, luego izquierda-derecha (`canvas-layout.js:36-40`) — new: missing.
- [x] `Enter` abre la seleccionada (no sobre botones ni roles interactivos, `main.js:26`); Enter/Espacio sobre una tarjeta con foco la abre (`components.js:35-39`) — new: missing.
- [x] `O` abrir en Claude — classic: `main.js:618` — new: missing.
- [ ] `T` renombrar — classic: `main.js:619-624` — new: missing.
- [x] `R` responder (abre y enfoca el campo) — classic: `main.js:625-630` — new: missing.
- [x] `P` fijar/soltar — classic: `main.js:631` — new: missing.
- [x] `A` Later (abre el menú; 1–5 eligen) o quitar de Later — classic: `main.js:577-585,632` — new: missing.
- [x] `E` hecha / reabrir — classic: `main.js:633` — new: missing.
- [x] `C` menú de color; 1–7 eligen, 0 quita — classic: `main.js:586-594,634` — new: missing.
- [x] `Z` deshacer la última acción — classic: `main.js:635` — new: missing.
- [x] `G` agrupar por repo — classic: `main.js:636` — new: missing.
- [x] `1` `2` `3` `4` vistas — classic: `main.js:637-640` — new: missing.
- [x] `[` `]` subir/bajar de fila en Tiers — classic: `main.js:641-647` — new: missing.
- [x] `N` nueva sesión — classic: `main.js:649` — new: missing.
- [x] `D` "Catch me up" — classic: `main.js:651` — new: missing.
- [x] `S` parar el turno (solo working) con toast "Stopping “<title>”…" — classic: `main.js:249-252,652` — new: missing.
- [x] `U` marcar para revisar (solo pending) — classic: `main.js:653` — new: missing.
- [x] `Esc` en cadena: salir del campo; cerrar menú Later; cerrar menú color; de un workspace a la conversación; cerrar el panel y soltar la tarjeta; soltar la selección — classic: `main.js:565-574` — new: partial (`SessionPanel.tsx:28-35` solo workspace → chat → cerrar).
- [x] Canvas `+`/`=`, `-`, `0` zoom — classic: `canvas.js:901-906` — new: missing.
- [x] Canvas `Espacio` (mantener) para desplazar, salvo en controles y el panel (`canvas.js:387`) — classic: `canvas.js:893-899,908-912` — new: missing.
- [x] Canvas `Esc` suelta la selección múltiple — classic: `canvas.js:900` — new: missing.
- [x] Esc cancela el dibujo de zona — classic: `canvas.js:658-663` — new: missing (no hay modo dibujo).
- [ ] Sin teclas con un diálogo abierto — classic: `main.js:555`, `canvas.js:892` — new: done (`App.tsx:54`).

## Animations

- [ ] FLIP de tarjetas — classic: `motion.js:69-186` — new: missing. Detalle:
  - Aparece: `opacity 0, translateY(6px) scale(.98)` → normal, 260 ms, `cubic-bezier(0.22, 1, 0.36, 1)` (`motion.js:89-92`).
  - Mismo grupo, otro sitio: desliza 320 ms con el mismo easing (`104`).
  - Otro grupo: una copia vuela por encima con arco (`translate(dx*.5, dy*.5-14) scale(1.03)` y sombra `0 18px 40px rgb(0 0 0/.35)` en la mitad), duración `min(620, 320 + distancia*0.3)` ms; al llegar `scale(1.015)` → normal 180 ms (`109-133`).
  - Archivada: sube `translateY(-8px) scale(1.02)` (18 %) y cae `translateY(min(fall,260)) rotate(-4deg) scale(.94)` con opacidad 0, 460 ms, `cubic-bezier(0.55, 0, 0.75, 0.3)` (`141-153`); las demás esperan 260 ms (`[data-settling]`, `styles.css:798-801`, `main.js:386-392`).
  - Hacia Done u otro destino `[data-fly]`: vuela y se encoge a `scale(.15)` en 540 ms `cubic-bezier(0.55, 0, 0.3, 1)`; el destino late `scale(1.12)` 260 ms con retraso 420 ms (`155-173`).
  - Sin destino: `opacity 0, scale(.96) translateY(-4px)` 220 ms.
  - Nada se anima al cambiar de vista, filtro o búsqueda (`scope`).
- [x] Sacudida de tarjetas que esperan — classic: `styles.css:843-858` `.ccard.state-asking, .ccard.state-permission { --amp: 1.4; animation: nudge 7s ease-in-out infinite; transform-origin: 50% 0 }`; `urgent-mid { --amp: 2; animation-duration: 5s }`; `urgent-high { --amp: 2.6; animation-duration: 3.6s }`; pausa en hover; `@keyframes nudge { 0%,9%,100% { transform: none } 1.5% { rotate(-amp deg) } 3% { rotate(amp) } 4.5% { rotate(-.7 amp) } 6% { rotate(.5 amp) } 7.5% { rotate(-.2 amp) } }`; retraso escalonado `-(hash(id) % 7000)/1000 s` (`canvas.js:90,131`) — new: missing.
- [ ] Ajuste "Shake waiting cards" (on/off) — classic: `main.js:88-90,721` clase `.no-shake` en `.app` (`styles.css:849`) — new: missing (no existe la preferencia).
- [x] Brillo `breathe` de la tarjeta que trabaja — ver Card — new: missing.
- [x] Giro del anillo `spin-ring 1.6s linear` — classic: `styles.css:322-323` — new: partial (`animate-spin` 1 s).
- [x] Latido `run-beat` del punto en segundo plano — ver Card — new: missing.
- [ ] Punto `pulse` 1.6s del chip "Working" — classic: `styles.css:259-260` — new: fuera de alcance (chip de estado del panel).
- [ ] Llegada del menú, toast y peek con `@starting-style` / keyframes — ver Card y Toasts — new: partial.
- [ ] Plegar/desplegar zona y soltar en carpeta — ver Zones y Canvas — new: missing.
- [ ] Panel: entra con `translateX(28px)` + opacidad, 420 ms `cubic-bezier(0.25, 1, 0.5, 1)` — classic: `styles.css:170-176`, `main.js:319-336` — new: partial (`App.tsx:78` `slide-in-from-right-8 fade-in duration-300`; sin animación de salida).
- [x] Skeleton mientras carga — classic: `main.js:753-754`, `styles.css:1013-1017` 5 filas 52px, radio 9px, `shimmer 1.2s linear infinite` — new: partial (`Canvas.tsx:215` texto "Connecting…").

## Toasts

- [ ] Diseño — classic: `styles.css:1021-1031` abajo a la derecha (`right: 20px; bottom: 20px; z-index: 50`), columna con gap 8px; toast con fondo `--text` y texto `--bg` (invertido), radio 10px, padding `10px 12px 10px 14px`, 13px, `--shadow-pop`, ancho máx. `min(460px, 100vw - 40px)`, texto en una línea con elipsis; entrada `opacity 0, translateY(8px)` → normal, 220 ms `var(--ease-out)` — new: partial (`components/ui/sonner.tsx:29-36` Sonner con `--popover` y borde; no invertido).
- [ ] Botón "Undo" con `kbd` Z — classic: `toasts.js:12`, `styles.css:1030-1031` peso 650, color `--accent`; `kbd` transparente con borde `color-mix(var(--bg) 30%)` — new: partial (solo en "Note deleted", sin Z ni color accent).
- [ ] Duración y cantidad — classic: `main.js:356-361` 3.5 s; 7 s con Undo; como máximo 3 a la vez — new: partial (valores por defecto de Sonner).
- [ ] `role="status" aria-live="polite"` — classic: `toasts.js:8` — new: done (Sonner).

## Other

- [x] Selección con teclado y tarjeta enfocable — classic: `tabindex="0"` en cada tarjeta y fila (`canvas.js:132`, `board.js:18,170`) — new: missing.
- [x] Arrastre HTML5 entre columnas y filas, con `cursor: grabbing` al pulsar — classic: `board.js:18-25`, `styles.css:444` — new: missing (no hay Board ni Tiers).
- [x] Clase `is-dragging` atenúa los destinos no válidos — classic: `main.js:721`, `styles.css:414,711` — new: missing.
- [x] Al quitar una tarjeta de la lista (Done sin `showDone`, Later) la selección pasa a la siguiente — classic: `main.js:396-400` — new: missing.
- [ ] Marcar como leída al abrir y mantener "no leída" tras "Mark to review" — classic: `main.js:440-447,474-475,493-496` — new: fuera de alcance (panel); verifícalo allí.
- [ ] Campana de aviso en la tarjeta — classic: `components.js:283-285` botón en la barra de acciones — new: done (`CardMenu.tsx:30`; además `SessionCard.tsx:71` muestra una señal de campana, que el clásico no tiene).
- [ ] Clic en tarjeta abre el panel con el cursor en el campo de respuesta (solo puntero, no en móvil) — classic: `main.js:464-478` — new: fuera de alcance (panel); verifícalo allí.
- [ ] Iconos — classic: `icons.js:4-67` trazo propio 24px, `stroke-width 2`, 60 nombres — new: partial (lucide; formas parecidas, pero distintas: p. ej. `question` clásico es un globo con "?", `Minimize2` frente a `shrink`).
