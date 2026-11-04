# Agent Center features

What the app does, one line per feature, grouped by where it is. The app
shows this file as its guide (the "?" key): a card per section, and in it a
card per feature; the lines dated after a person's last look are "What's new".
When you add or change a feature, add or change its line here.

A section: `## {icon} Name`. A feature: `- {icon} **Title**: one sentence on
what to press or click and what happens.` Keys go in backticks (they show as
keys). A line that ends in ` · YYYY-MM-DD` is new from that day. The icons are
Lucide's names, and must be in `web/src/features/guide/icons.ts`.

## {layout-grid} Views

- {inbox} **Inbox**: one list of your sessions grouped by state; a click or `↵` opens one.
- {columns-3} **Board**: a column per state; drag a card to another column, or press `G` for a lane per repo.
- {rows-3} **Tiers**: rows by importance; `[` `]` move a session up or down a row, `<` `>` within it.
- {list-todo} **Next up**: `F` walks you through the sessions that wait for you, one after the other.
- {sparkles} **Catch me up**: `D` asks Claude to sum up what every session did since the last summary.
- {search} **Search**: `/` or `⌘K` searches every conversation, archived ones too; `⌘↵` opens it in Claude.
- {plus} **New session**: `N`, then pick a folder and write the prompt; in a git repo it can get its own worktree.
- {mouse-pointer-click} **Right-click**: anything on the page, for its actions.

## {bot} Sessions

- {bell-ring} **Waiting cards shake**: a card that waits for you shakes now and then, harder the longer it waits; one at work glows.
- {clock} **Later**: `A` or `1`–`5` puts a session away for a while.
- {palette} **Colour and pin**: `C` gives a session a colour, `P` keeps it on top.
- {command} **Quick keys**: `E` marks done, `Z` undoes, `T` renames, `O` opens in Claude, `S` stops the running turn.
- {play} **Run**: start a session's project in its folder, see where it listens and read its output.
- {square-terminal} **Terminal sessions**: a session that runs in a terminal says so; Open in Claude asks first, as Claude desktop would open a separate copy. · 2026-11-04
- {copy-x} **Open twice**: a session open in two places at once (a terminal and Claude desktop) is marked in red: neither sees the other's messages. · 2026-11-04

## {shapes} Canvas

- {sticky-note} **Notes**: double-click the empty canvas for a sticky note.
- {square-check} **Checklists**: in a note, `- [ ] ` makes a box to tick; a click on a line's text writes on that line. · 2026-11-04
- {link} **Notes on cards**: a note put next to a card attaches to it and moves with it.
- {frame} **Zones**: a zone groups cards; drag it and its cards and notes come along.
- {folder} **Folders**: fold a zone into a folder; a card dropped on it goes in, a click unfolds it.
- {circle-check} **Done**: drop a card on "Done" at the bottom to finish it; drag it out to reopen it.
- {move} **Move around**: `Space` and drag moves the view, `+` `−` `0` zoom, a drag on the empty canvas picks several cards.

## {message-square} Conversation

- {reply} **Reply**: write in the box at the bottom; paste or drop files, or dictate with the microphone. A draft stays three days.
- {sliders-horizontal} **Mode and model**: the pills under the box change them in the session.
- {wand-sparkles} **Suggested reply**: after a turn it shows grey in the box; `Tab` or `→` writes it, "Send suggestion" sends it. · 2026-11-03
- {terminal} **Run a command**: a command block has Run, in the session's folder; one that touches prod or deletes asks for a second click. · 2026-11-03
- {git-fork} **Fork**: the link under one of your messages starts a new session from that point.
- {map} **Map**: in a long conversation, the rail on the right marks your messages, questions and failures; a click goes there.
- {circle-arrow-right} **Next steps**: when a session waits, chips offer the obvious step: review, commit, push, open the PR.
- {download} **Download files**: a file chip opens the file in Files; its arrow downloads it. · 2026-11-03
- {gauge} **Context**: the ring under the box shows how full the context is; hover it for the tokens and the cost.

## {panel-right} Session tabs

- {file-diff} **Changes**: the branch's diff; click a line to comment, and the comments go to Claude as one message.
- {git-commit-horizontal} **Commits**: the history of every repo the session touched, as a graph.
- {code} **Code**: the repository in an editor; `⌘P` opens a file, `⌘⇧F` searches, `⌘S` saves.
- {git-pull-request} **PRs**: the session's pull requests, their checks and reviews, merge and close, and the files changed.
- {ticket} **Tickets**: the Jira tickets linked to the session.
- {activity} **Trace**: a turn on a timeline, with its model calls, tools, subagents and slowest step.
- {file-text} **Files**: what the session sent or wrote, shown here (Markdown, PDF, Word, Excel…); Download saves it. · 2026-11-03
- {list-checks} **Tasks**: the organizer tasks made in this conversation, to tick off.

## {ticket} Jira

- {kanban} **Tickets view**: your Jira tickets on your team's board columns, by epic if you like, with filters.
- {file-text} **A ticket, whole**: description, comments, parent and children, and the sessions linked to it.
- {ticket-check} **Status and comments**: on a ticket assigned to you, change its status and comment.
- {plus} **Sessions from tickets**: tick one or more tickets to start a session about them, or link one to a session that exists.
- {lightbulb} **Sync hints**: a hint shows when a ticket's PR is ahead of its status in Jira.
- {workflow} **Pipeline**: agents take tickets from refinement to plan, build, review and release, stage by stage. · 2026-11-03

## {panel-left} Sidebar

- {timer} **Limits**: your 5-hour and weekly use, when each resets, and where your pace gets you.
- {book-text} **General context**: read and edit CLAUDE.md and what each project remembers.
- {paw-print} **Pets**: open packs and send a pet out on the board to keep you company. · 2026-11-03
- {settings} **Settings**: setup steps for this Mac, alerts (notifications, chime, reading aloud) and the look; it warns when the terminal and Claude desktop use different accounts. · 2026-11-04
