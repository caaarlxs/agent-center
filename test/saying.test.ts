import { describe, expect, it } from "bun:test"
import { gerundOf, sayingOf } from "../lib/saying"

const you = (text: string) => ({ type: "user", message: { content: text } })
const call = (name: string, input: Record<string, unknown>) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: name, name, input }] } })

describe("gerundOf", () => {
  it("turns the first verb into its -ing form, as Claude desktop shows it", () => {
    expect(gerundOf("Check complexity, commit, push and open PR")).toBe("Checking complexity, commit, push and open PR")
    expect(gerundOf("Run the server tests")).toBe("Running the server tests")
    expect(gerundOf("Write the guide")).toBe("Writing the guide")
    expect(gerundOf("Add the guide lines")).toBe("Adding the guide lines")
    expect(gerundOf("Stop the server")).toBe("Stopping the server")
    expect(gerundOf("Find where team task is referenced")).toBe("Finding where team task is referenced")
  })
  it("leaves what does not start with a verb it knows", () => {
    expect(gerundOf("Server tests")).toBe("Server tests")
    expect(gerundOf("Checking it")).toBe("Checking it")
  })
})

describe("sayingOf", () => {
  it("the step of its task list in progress, in its own -ing words", () => {
    const todo = call("TodoWrite", { todos: [{ content: "Fix the filter", activeForm: "Fixing the filter", status: "in_progress" }, { content: "Test", activeForm: "Testing", status: "pending" }] })
    expect(sayingOf([you("go"), todo, call("Bash", { command: "ls", description: "List files" }), call("Read", { file_path: "a.ts" })])).toBe("Fixing the filter")
  })
  it("else the last command or agent that said what it does, kept while it reads and edits", () => {
    expect(sayingOf([you("go"), call("Bash", { command: "bun test", description: "Run the server tests" }), call("Read", { file_path: "a.ts" }), call("Edit", { file_path: "a.ts" })])).toBe("Running the server tests")
    expect(sayingOf([you("go"), call("Agent", { description: "Survey the pipeline code", prompt: "…" })])).toBe("Surveying the pipeline code")
  })
  it("only this turn's: nothing said yet, nothing", () => {
    expect(sayingOf([you("a"), call("Bash", { command: "x", description: "Old thing" }), you("b"), call("Read", { file_path: "a.ts" })])).toBeNull()
  })
})
