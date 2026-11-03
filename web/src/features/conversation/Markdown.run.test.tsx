// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render } from "@testing-library/react"
import { Markdown, SessionOf } from "./Markdown"

vi.stubGlobal("fetch", () => new Promise(() => {})) // nothing to load in a test

const md = (text: string) => render(<SessionOf.Provider value="s1"><Markdown>{text}</Markdown></SessionOf.Provider>)

describe("Run on a code block", () => {
  it("shows on a block with no language made of commands", async () => {
    const { container } = md("Run:\n\n```\ncd ~/x\nSTAGE=prod EXECUTE=true .venv/bin/python a.py\n```\n\nFiles:\n\n```\n~/x/tmp/a.json\n```\n\n```bash\nls\n```")
    await act(() => new Promise(r => setTimeout(r, 300)))
    const boxes = [...container.querySelectorAll("pre")].map(p => !!p.parentElement?.querySelector(".code-run"))
    expect(boxes).toEqual([true, false, true])
  })
  it("asks once more before a prod command", async () => {
    const { container } = md("```\naws dynamodb get-item --table-name flags-prod\n```")
    await act(() => new Promise(r => setTimeout(r, 300)))
    const run = container.querySelector(".code-run") as HTMLButtonElement
    fireEvent.click(run)
    expect(run.textContent).toContain("Run · prod?")
  })
})
