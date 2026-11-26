import { describe, expect, it } from "bun:test"
import { stepCommands } from "./step-commands"

describe("a person's step's commands", () => {
  it("go to the ticket's folder, simulate first, then do it, in that environment", () => {
    expect(stepCommands("/Users/a/Agent Center/PP-1", "M3", "prod")).toBe(
      'cd "/Users/a/Agent Center/PP-1"\nSTAGE=prod bash steps/M3.sh            # ver qué haría (solo lee)\nSTAGE=prod DRY_RUN=0 bash steps/M3.sh  # hacerlo')
  })
})
