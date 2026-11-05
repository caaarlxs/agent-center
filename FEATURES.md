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

- {sparkles} **Cards at a glance**: every card the same size; it says what the session is doing in its own words (as Claude desktop does), its question in amber when it waits for you, and three cells: files not committed, commits not pushed, PRs open. · 2026-11-04
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
- {circle-check} **Done**: drop a card on "Done" at the bottom to finish it; there it shrinks to a strip with its title, repo and age; drag it out to reopen it. · 2026-11-05
- {move} **Move around**: `Space` and drag moves the view, `+` `−` `0` zoom, a drag on the empty canvas picks several cards.

## {message-square} Conversation

- {reply} **Reply**: write in the box at the bottom; paste or drop files, or dictate with the microphone. A draft stays three days.
- {sliders-horizontal} **Mode and model**: the pills under the box change them in the session.
- {wand-sparkles} **Suggested reply**: after a turn it shows grey in the box; `Tab` or `→` writes it, "Send suggestion" sends it. · 2026-11-03
- {terminal} **Run a command**: a command block has Run, in the session's folder; one that touches prod or deletes asks for a second click. · 2026-11-03
- {messages-square} **Selected text**: select text in a conversation for Side chat (a new session that knows the whole conversation, to ask about it) or Reply (it goes quoted into the box). · 2026-11-04
- {git-fork} **Fork**: the link under one of your messages starts a new session from that point.
- {map} **Map**: in a long conversation, the rail on the right marks your messages, questions and failures; a click goes there.
- {circle-arrow-right} **Next steps**: when a session waits, chips offer the obvious step: review, commit, push, open the PR.
- {download} **Files beside the chat**: a file chip or a link to a file opens it beside the conversation, over the board, so you read and write at once; drag its left edge to widen it, `Esc` closes it, Files opens it in its tab, and the chip's arrow downloads it. · 2026-11-05
- {file-text} **Documents**: a Markdown file shows as a page, line for line: sections under a rule, lead-ins and list numbers in colour, quotes as callouts, striped tables; a click on one of its `[ ]` boxes ticks it in the file; a double-click on a paragraph (or its pencil) lets you write it, a `____` blank picked ready to type over (`⌘↵` or a click away saves, `Esc` leaves it), and Source edits it all (Save or `⌘S`). · 2026-11-05
- {refresh-cw} **Compacting and retries**: while a session compacts its conversation, or tries a failed call to the API again, its orb and its line say so (with the attempt): it is not stuck. · 2026-11-04
- {gauge} **Context**: the ring under the box shows how full the context is; hover it for the tokens and the cost.

## {panel-right} Session tabs

- {file-diff} **Changes**: the branch's diff; click a line to comment, and the comments go to Claude as one message.
- {git-commit-horizontal} **Commits**: the history of every repo the session touched, as a graph.
- {code} **Code**: the repository in an editor; `⌘P` opens a file, `⌘⇧F` searches, `⌘S` saves.
- {git-pull-request} **PRs**: the session's pull requests, their checks and reviews, merge and close, and the files changed.
- {ticket} **Tickets**: the Jira tickets linked to the session, as a tree from the epic down to its sub-tasks, each with its kind in words; a click shows one below. · 2026-11-04
- {activity} **Trace**: a turn on a timeline, with its model calls, tools, subagents and slowest step.
- {file-text} **Files**: what the session sent or wrote, shown here (Markdown, PDF, Word, Excel…); Download saves it. · 2026-11-03
- {list-checks} **Tasks**: the organizer tasks made in this conversation, to tick off.

## {ticket} Jira

- {kanban} **Tickets view**: your Jira tickets on your team's board columns, with filters; By parent groups each under the highest ticket above it (its epic, else its story). · 2026-11-05
- {file-text} **A ticket, whole**: description, comments, parent and children, and the sessions linked to it.
- {ticket-check} **Status and comments**: on a ticket assigned to you, change its status and comment.
- {plus} **Sessions from tickets**: tick one or more tickets to start a session about them, or link one to a session that exists.
- {lightbulb} **Sync hints**: a hint shows when a ticket's PR is ahead of its status in Jira.

## {workflow} Pipeline

- {workflow} **Pipeline**: agents take a Jira ticket through Refine, Plan, Build, Review, Staging, Test, Prod and Smoke, and stop wherever a person must decide. · 2026-11-03
- {play} **Run pipeline**: in a ticket, Run pipeline starts the refinement; on someone else's ticket, Assign to me and run takes it first, with a second click to confirm.
- {kanban} **The board**: Pipeline in the sidebar shows a column per stage and a card per ticket, all the same size: its orb, the one line that matters now, its key, cost and time; a click opens the ticket. · 2026-11-04
- {orbit} **Stage effects**: a card's right part shows its stage at work (Refine's steps falling, the plan's graph, code raining in Build, Review's scan, packets to staging, Test's grid, rings in Prod, Smoke's heartbeat); it stops in amber when it waits for you, red when it failed, grey when done. · 2026-11-04
- {fast-forward} **Run to review**: next to Run pipeline, Run to review refines, plans, builds and reviews on its own, stage after stage, and stops before staging with the PRs done; a stage that asks waits for your answers, then goes on. Stop auto stops it after the stage at work. · 2026-11-04
- {message-circle-question} **Refine**: the agent reads the ticket and the code and asks only what it cannot decide, each question with its proposal; change what you want and Send to Jira and continue (`⌘↵`).
- {list-tree} **Plan**: it splits the work into units, one per repo, with a to-do list, the scripts to run on the data and the order of the release.
- {hammer} **Build**: it writes the code and opens a draft PR per unit; the to-do list ticks itself as it goes.
- {eye} **Review**: it reads the PRs and lists findings, blocking or minor; tick the ones to fix and Fix with build sends them back. A blocking one stops the release.
- {shield-check} **Checks**: after every stage the board checks by itself that the repos are clean, the PRs are drafts on the plan's branch, CI passes and no test was deleted, switched off or lost assertions; a check that fails warns, it never stops the agent.
- {server} **Staging**: the board merges and deploys each repo in the plan's order; a script on the data first runs as a simulation, with a CSV report to read before Run for real.
- {scale} **Gate agent**: an agent looks at each step that waits for you (a simulation's report, a tag, a release PR) and says go or hold, and why; the yes is still yours.
- {flask-conical} **Test in staging**: an agent checks each acceptance criterion in staging and marks it pass or fail, with its evidence; a failure stops the way to prod.
- {rocket} **Prod**: every step asks first, and the riskiest (merge, tag, run for real) ask twice; where the team set one, a dialog first reminds you what must be done outside the board, like a mobile build sent to the store.
- {heart-pulse} **Check prod**: after the release, an agent checks in prod that what the ticket asked for works.
- {undo-2} **Roll back**: Roll back staging or Roll back prod undoes the release the other way round (a revert PR for each merge, the previous tag deployed again); it asks twice.
- {ticket-check} **Jira status**: the board moves the ticket as the team does: sub-tasks to In progress when the build starts and to In review with their PR, to Done in staging; the story to Ready for prod when the test passes, or reopened with a [Fix] sub-task per failure, and to Done in prod. Only what is yours moves; the rest is a warning in Checks. · 2026-11-04
- {book-text} **Reads it all**: a stage reads the whole ticket (its children and their sub-tasks), the Confluence pages it links to as they are now (a struck line is a decision dropped), the team's system map and, read-only, the Figma designs it links to; what it proposes is marked "Propuesta, confirmar", and what the docs miss comes back under "Para actualizar la documentación". · 2026-11-04
- {list-tree} **Run a whole epic**: Run pipeline on a ticket with children delivered on their own (an epic's stories) refines it once as a whole (coverage, order, shared questions), then runs each child's own pipeline, two at a time, in that order; a child goes to staging once what it depends on is there. · 2026-11-04
- {flask-conical} **Evidence**: each criterion of a test shows its proof under it (screenshots on desktop and phone, the PDF staging made, the request and its response, rows before and after); a click opens it, and it goes to the Jira story for QA. · 2026-11-04
- {list-checks} **Code debt**: Build and Review note the code that breaks a team rule but that their ticket does not touch, instead of fixing it there; Debt, on the Pipeline view, lists it by repo, once per file and rule, and turns the points you pick into one Jira ticket (or dismisses them). Improvements sit apart: what a shared library (core-lib, shared components) could offer and a ticket wrote by hand instead of changing the library. A grave point is also a warning in its ticket. · 2026-11-05
- {lock} **Limits**: agents never merge, push to main or touch prod: only the board does, step by step. Start over clears the runs and the labels; the comments stay in Jira.

## {panel-left} Sidebar

- {timer} **Limits**: your 5-hour and weekly use, when each resets, and where your pace gets you.
- {book-text} **General context**: read and edit CLAUDE.md and what each project remembers.
- {paw-print} **Pets**: open packs and send a pet out on the board to keep you company. · 2026-11-03
- {settings} **Settings**: setup steps for this Mac, alerts (notifications, chime, reading aloud) and the look; it warns when the terminal and Claude desktop use different accounts. · 2026-11-04
