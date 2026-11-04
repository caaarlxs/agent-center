# Agent Center features

What the app does, one line per feature, grouped by where it is. The app
shows this file as its guide (the "?" key) and its new lines as "What's
new". When you add or change a feature, add or change its line here.

Rules for a line: one feature, one sentence, what to press or click and what
happens. A line that ends in ` · YYYY-MM-DD` is new from that day; "What's
new" shows the lines dated after a person's last look.

## Views

- Inbox, Board, Canvas and Tiers show the same sessions four ways; the keys 1 2 3 4 switch between them.
- Inbox: one list of your sessions grouped by state; a click or Enter opens one.
- Board: a column per state; drag a card to another column, or press G for a lane per repo.
- Tiers: rows by importance; [ and ] move a session up or down a row, < and > within it.
- Next up (F): the sessions that wait for you, one after the other.
- Catch me up (D): Claude sums up what every session did since the last summary.
- Search (/ or ⌘K): every conversation, archived ones too; ↵ opens it here, ⌘↵ in Claude.
- New session (N): pick a folder and write the prompt; in a git repo it can get its own worktree.
- Right-click anything for its actions.

## Sessions

- A card that waits for you shakes now and then, harder the longer it waits; one at work glows.
- Later (A, or 1–5) puts a session away for a while; Colour (C) marks it; Pin (P) keeps it on top.
- E marks a session done, Z undoes, T renames it, O opens it in Claude, S stops its running turn.
- Run: start a session's project in its folder, see where it listens and read its output.

## Canvas

- Place session cards anywhere; double-click the empty canvas for a sticky note.
- Zones group cards: drag one and its cards and notes come along; fold it into a folder.
- A card dropped on a folded zone goes into it; a click on the folder unfolds it.
- Drop a card on "Done" at the bottom to finish it; drag it out to reopen it.
- A note put next to a card attaches to it and moves with it.
- In a note, "- [ ] " makes a box to tick; a click on a line's text writes on that line. · 2026-11-04
- Space and drag moves the view; + − 0 zoom; a drag on the empty canvas picks several cards.

## Conversation

- Reply in the box at the bottom; paste or drop files, or dictate with the microphone. A draft stays three days.
- The pills under the box change the session's mode and model.
- After a turn, a suggested reply shows grey in the box: Tab or → writes it, "Send suggestion" sends it. · 2026-11-03
- A command block has Run: it runs in the session's folder; one that touches prod or deletes asks for a second click. · 2026-11-03
- Fork, under one of your messages, starts a new session from that point.
- In a long conversation, the rail on the right marks your messages, questions and failures; a click goes there.
- When a session waits, the Next chips offer the obvious step: review, commit, push, open the PR.
- A file chip opens the file in Files; its arrow downloads it. · 2026-11-03
- The ring under the box shows how full the context is; hover it for the tokens and the cost.

## Session tabs

- Changes: the branch's diff; click a line to comment, and the comments go to Claude as one message.
- Commits: the history of every repo the session touched, as a graph.
- Code: the repository in an editor; ⌘P opens a file, ⌘⇧F searches, ⌘S saves.
- PRs: the session's pull requests, their checks and reviews, merge and close, and the files changed.
- Tickets: the Jira tickets linked to the session.
- Trace: a turn on a timeline, with its model calls, tools, subagents and slowest step.
- Files: what the session sent or wrote, shown here (Markdown, PDF, Word, Excel…); Download saves it. · 2026-11-03
- Tasks: the organizer tasks made in this conversation, to tick off.

## Jira

- Tickets view: your Jira tickets on your team's board columns, by epic if you like, with filters.
- A ticket opens whole: description, comments, parent and children, and the sessions linked to it.
- On a ticket assigned to you, change its status and comment.
- Tick one or more tickets to start a session about them; link a ticket to a session that exists.
- A hint shows when a ticket's PR is ahead of its status in Jira.
- Pipeline view: tickets that agents take from refinement to plan, build, review and release, stage by stage. · 2026-11-03

## Sidebar

- Limits: your 5-hour and weekly use, when each resets, and where your pace gets you.
- General context: read and edit CLAUDE.md and what each project remembers.
- Pets: open packs and send a pet out on the board to keep you company. · 2026-11-03
- Settings: setup steps for this Mac, alerts (notifications, chime, reading aloud) and the look.
