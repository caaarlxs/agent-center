// Each action in a conversation: its title as Claude wrote it (the
// description it gives a command or an agent) and the whole detail.

import { expect, test } from "bun:test"
import { actionOf } from "../lib/transcript"

test("a command keeps its description as title and the whole command as detail", () => {
  const command = `cd ~/repo && grep -rn "x" lib | head -${"9".repeat(200)}`
  expect(actionOf("Bash", { command, description: "Find the bridge version" })).toEqual({ tool: "Bash", title: "Find the bridge version", detail: command })
})

test("a tool without a description: no title, its file or query as detail", () => {
  expect(actionOf("Read", { file_path: `${process.env.HOME}/repo/App.tsx` })).toEqual({ tool: "Read", title: null, detail: "~/repo/App.tsx" })
  expect(actionOf("mcp__github__search_issues", { query: "is:open" })).toEqual({ tool: "search_issues", title: null, detail: "is:open" })
  expect(actionOf("TodoWrite", {})).toEqual({ tool: "TodoWrite", title: null, detail: "" })
})
