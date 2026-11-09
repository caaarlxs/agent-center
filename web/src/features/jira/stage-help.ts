// What each stage of the journey is and what you can do there: the card behind
// its (?). Staging holds the test in staging; prod, the check in prod.
import type { Stage } from "@server/pipeline"

export type StageHelp = { what: string; can: string[] }

export const STAGE_HELP: Partial<Record<Stage, StageHelp>> = {
  refine: {
    what: "Reads the whole ticket and turns it into acceptance criteria.",
    can: [
      "Asks product questions, each explained and with a proposal: answer here or in Jira, or change the proposal",
      "Ask about a question you do not follow",
      "Proposes tickets apart: create or dismiss each one",
      "Warns when the ticket makes a rule of deale-context untrue",
      "On an epic: one refine for the epic and each story, with every question at once; the stories then start at their plan (Run mine: only yours)",
      "Run to review goes on alone up to the review",
    ],
  },
  plan: {
    what: "Splits the work into units: one repo and one PR each.",
    can: [
      "Shows the units, the to-do list and the scripts on the data",
      "Shows the release steps before the release",
      "Asks only when the code contradicts a decision; may propose tickets",
    ],
  },
  build: {
    what: "Writes the code: a worktree for each unit, each PR as a draft.",
    can: [
      "Follow each unit and its to-dos live",
      "Its PRs, with their checks",
      "Moves your sub-tasks in Jira",
      "After a review or a test, fixes only what you chose",
      "Stop it, or build again",
    ],
  },
  review: {
    what: "Reads the PRs against the acceptance criteria.",
    can: [
      "Findings by severity: a blocker keeps the ticket out of staging",
      "Pick the findings to fix: a build fixes only those",
      "Notes code debt: into a debt ticket, or dismissed",
      "Ask about a finding",
    ],
  },
  staging: {
    what: "The board deploys to staging step by step; then an agent tests each criterion there.",
    can: [
      "Approve or skip each step: merges, scripts, commands",
      "An agent solves merge conflicts",
      "Each script's report; roll back, then build again",
      "Each criterion passes, fails or is untested, with screenshots",
      "Checked by hand, for what the agent could not try",
      "Fix with build, then Test again: deep on what changed",
      "A failed criterion opens a [Fix] sub-task in Jira",
    ],
  },
  prod: {
    what: "The board deploys to prod as in staging; then an agent checks prod, only reading.",
    can: [
      "Approve or skip each step, with a tag of your own",
      "The tag goes on the code tested in staging",
      "Roll back",
      "The check in prod warns in Jira if something fails",
    ],
  },
}
