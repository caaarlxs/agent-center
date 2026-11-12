# Pipeline

The Pipeline takes a Jira ticket from refinement to production with agents, one stage at a
time. It stops wherever a person must decide, and the board itself does every step that writes
to Jira, GitHub or an environment.

> The Pipeline is optional and young. It grew around one team's workflow (Jira Cloud, GitHub,
> a staging and a production environment). Its briefs to the agents, and what it writes in Jira,
> are in Spanish today. The rest of the board works without it.

## The stages

| Stage | Who | What happens |
|---|---|---|
| Refine | Agent | Reads the ticket, the code and the docs. Asks only what it cannot decide, each question with a proposal. |
| Plan | Agent | Splits the work into units, one per repository and pull request, with a to-do list, data scripts and the release order. |
| Build | Agent | Writes the code and opens a draft PR per unit. The to-do list ticks itself as it goes. |
| Review | Agent | Reads the PRs and lists findings: blocker, major or minor. You pick what goes back to Build. |
| Staging | Board | Merges and deploys each repository in the plan's order. A data script runs first as a simulation, with a report to read. |
| Test | Agent | Checks each acceptance criterion in staging and marks it pass, fail or untested, with evidence. |
| Prod | Board | Every step asks first. The riskiest (merge, tag, run a script for real) ask twice. |
| Smoke | Agent | Checks in production, read-only, that what the ticket asked for works. |

After every stage, the board checks by itself that the repositories are clean, the PRs are drafts
on the plan's branch, CI passes, and no test was deleted, switched off or emptied. A failed check
is a warning; it never stops the agent.

### How you run it

- **Run pipeline** on a ticket starts the refinement. Each stage then waits for you.
- **Run to review** refines, plans, builds and reviews on its own, and stops before staging.
- **Run mine** runs the work assigned to you under someone else's ticket (an epic, for example).
  That ticket is context only: nothing is written on it.
- **Send back** takes a ticket to an earlier stage, with a note on what to change.
- **Roll back** undoes a release to staging or prod: a revert PR for each merge, the previous tag
  deployed again. It asks twice.

A ticket takes in everything under it that is assigned to you, at any depth: one card, one
refinement, one plan, one build, one review, one release.

### Specialists

Under the Pipeline's columns, each stage's agent also works on its own, out of the chain:
Refiner, Planner, Builder, Reviewer, Tester and Prod checker. Hand one a ticket (or PR links, for
the Reviewer) and it leaves its result on the board. It writes nothing in Jira or GitHub, unless
you publish its findings.

## What agents can and cannot do

- Agents never merge, push to the main branch or touch production. Only the board does, step by
  step, and only after you say yes.
- Agents never write in Jira. They leave their results in files; the board writes the comments,
  labels and statuses, and only on tickets assigned to you.
- Agents never create Jira tickets. They propose them; you create each one.
- Agents run clean: none of your settings, hooks, `CLAUDE.md` or connectors. This keeps each
  call cheaper, and keeps a connector from writing where it should not.
- Each stage runs one session per ticket. A new run of the stage (after your answers, a fix or a
  Send back) goes on in that session, with all it knew.

## Set it up

You need:

1. Jira connected: the gear in the sidebar, then **Jira** (site, email, API token, project keys).
2. `gh` installed and signed in, with push access to your repositories.
3. Your team's stage instructions in the state folder (below).

### The stage instructions

The instructions belong to your team, so this repository does not ship them. The board tells
each agent to read them from `<state>/data/pipeline/stages/`, where `<state>` is
`~/Library/Application Support/Agent Center` unless you changed it.

| File | Read by | What to put in it |
|---|---|---|
| `environment.md` | every agent | Your repositories, where they live, how to run their tests, your environments and their URLs, and what is never allowed. |
| `refine.md` | Refine | What a ready ticket looks like, which questions are product questions, the acceptance criteria format. |
| `plan.md` | Plan | How to split work into units, branch names, the release order. |
| `build.md` | Build | Your code rules, tests, commit and PR conventions, and how to fix a review. |
| `review.md` | Review | What to look for and how to rate it. |
| `test.md` | Test | How to check a criterion in staging and what evidence to keep. |
| `smoke.md` | Smoke | What to check in production, read-only. |
| `scripts.md` | Plan, Build, Review | How to write a script that changes data, with its simulation. |

The output of each stage is fixed by the board, not by these files. Each agent writes
`<stage>.md` (the document), `<stage>.summary.md` (a short summary) and `<stage>.json` (what the
board reads: a verdict, questions, and the units, findings or results).

### `jira.json`: statuses and new tickets

Optional. Without it, the board writes comments and labels but moves no status.

```json
{
  "statuses": {
    "inProgress": { "id": "3", "name": "In Progress" },
    "inReview": { "id": "10053", "name": "In Review" },
    "done": { "id": "10020", "name": "Done" },
    "testing": { "id": "10067", "name": "Testing" },
    "reopened": { "id": "10351", "name": "Reopened" },
    "readyForProd": { "id": "10219", "name": "Ready for prod" }
  },
  "subtaskType": "10003",
  "fixPrefix": "[Fix]",
  "contextPages": ["123456789"],
  "newIssue": { "project": "ABC", "types": { "story": "10001", "task": "10002", "bug": "10004" }, "labels": [], "components": [] },
  "debtIssue": { "project": "ABC", "typeId": "10001", "labels": ["tech-debt"] }
}
```

- `statuses`: the transition ids of your workflow. Sub-tasks move to In Progress when the build
  starts, to In Review with their PR, and to Done in staging. The story moves to Ready for prod
  when the test passes, or is reopened with a `[Fix]` sub-task when it fails.
- `contextPages`: Confluence page ids every stage reads (your team's system map, for example).
- `newIssue` and `debtIssue`: how the board creates the tickets you accept from proposals and from
  the code debt register.

### `deploy.json`: how each repository reaches an environment

Optional. Without it, staging merges each PR and production tags the repository.

```json
{
  "mergeMethod": "merge",
  "default": { "staging": "merge", "prod": "tag" },
  "repos": {
    "web-app": { "staging": "merge", "prod": "promote:production" },
    "mobile-app": { "staging": ["merge", "command:npm run ota -- --channel staging"], "prod": "manual:Send the build to the store" },
    "docs": { "prod": "skip" }
  },
  "tag": { "bump": "minor" },
  "setup": { "web-app": "npm ci" },
  "remind": { "mobile-app": { "prod": "Is the store build approved?" } },
  "gateAgent": true,
  "gates": { "staging": "agent", "prod": "person" }
}
```

A repository's way to an environment is one of these, or several in a row:

| Way | What the board does |
|---|---|
| `merge` | Merges the PR and waits for its deployment. |
| `merge-only` | Merges the PR; nothing deploys. |
| `tag` | Tags the repository and waits for the deployment the tag starts. |
| `promote:<branch>` | Promotes the code to that branch. |
| `command:<command>` | Runs the repository's own command: first with `--dry-run` (or the `dryRun` you set), then for real. `{key}` and `{summary}` become the ticket's. |
| `manual:<text>` | A step only a person does; the board waits for your yes. |
| `skip` | Nothing. |

Other fields: `secrets` (variables for a repository's commands, read from the keychain as
`keychain:<service>`), `remind` (what a person must have done before a release starts),
`gateAgent` and `gates` (an agent looks at each waiting step and says go or hold; where a gate
is `agent`, its go is the yes), `undo` (how a person undoes what a repository's command
published) and `contextRepo` (a repository of team context the agents keep true).

### `figma-mcp.json`

Optional. The MCP configuration the stages use to read the Figma designs a ticket links to,
read-only. For example: `{"mcpServers": {"figma": {"type": "http", "url": "https://mcp.figma.com/mcp"}}}`.

## Where it keeps its state

Each ticket keeps its state in `<state>/data/pipeline/<KEY>/`: `state.json`, `ticket.md` (the
snapshot the agents read), each stage's results, the evidence of its tests and the worktrees of
its build (`work/`).

In Jira, the board adds labels that say how far a ticket got: `agent`, `agent-needs-info`,
`agent-ready`, `agent-planned`, `agent-built`, `agent-reviewed`, `agent-staging`, `agent-tested`,
`agent-prod` and `agent-live`.

**Remove from pipeline** stops the agent, takes the labels off and puts the run aside. Jira's
statuses, the PRs and the code stay. **Clean up** then lists what the runs left (worktrees, local
branches, folders) for you to pick and delete.

## What it costs

Each agent stage runs Claude Opus with high or medium effort, on your account. A stage's cost
shows on its card. See **Where it goes** in the sidebar for the Pipeline's share of your usage.
