import { describe, expect, it } from "vitest"
import { dialogAnswer, endOf, familyOf, isShellLike, isTemplate, partsOf, pathInCode, pathInLink, riskOf } from "./text"

describe("partsOf", () => {
  it("folds pasted blocks away from what was typed", () => {
    const { parts, isLong } = partsOf("look <pasted_content>a\nb</pasted_content> here")
    expect(parts).toEqual([{ typed: "look " }, { pasted: "a\nb" }, { typed: " here" }])
    expect(isLong).toBe(false)
  })
  it("counts only typed text as long", () => {
    expect(partsOf("x".repeat(701)).isLong).toBe(true)
    expect(partsOf(`hi <pasted-content>${"x".repeat(2000)}</pasted-content>`).isLong).toBe(false)
  })
})

describe("isTemplate", () => {
  it("is a reply that asks to be completed", () => {
    expect(isTemplate("The name is: ")).toBe(true)
    expect(isTemplate("Use this one…")).toBe(true)
    expect(isTemplate("Go on...")).toBe(true)
    expect(isTemplate("Yes, merge it")).toBe(false)
  })
})

describe("dialogAnswer", () => {
  it("says the app's answers in words", () => {
    expect(dialogAnswer("Create a new branch named fix/login.")).toBe("New branch: fix/login")
    expect(dialogAnswer("Stay on the current branch")).toBe("Stay on the current branch")
    expect(dialogAnswer("Approved")).toBe("Approved")
  })
})

describe("paths", () => {
  it("finds a file in inline code", () => {
    expect(pathInCode("/Users/me/report.md")).toBe("/Users/me/report.md")
    expect(pathInCode("~/x.py")).toBe("~/x.py")
    expect(pathInCode("npm run build")).toBeNull()
  })
  it("finds a file in a relative link, without the line number", () => {
    expect(pathInLink("src/app%20one.ts:12:3")).toBe("src/app one.ts")
    expect(pathInLink("https://example.com")).toBeNull()
    expect(pathInLink("#top")).toBeNull()
  })
})

describe("familyOf", () => {
  it("groups types by colour", () => {
    expect(familyOf("xlsx")).toBe("sheet")
    expect(familyOf("md")).toBe("doc")
    expect(familyOf("pdf")).toBe("pdf")
    expect(familyOf("ts")).toBe("code")
  })
})

describe("endOf", () => {
  const base = { isRunning: false, startedAt: 0, endedAt: 3200, exitCode: 0, wasStopped: false }
  it("says how a command ended", () => {
    expect(endOf({ ...base, isRunning: true })).toBeNull()
    expect(endOf(base)).toEqual({ isOk: true, text: "Done in 3 s" })
    expect(endOf({ ...base, exitCode: 2 })).toEqual({ isOk: false, text: "Ended with code 2 in 3 s" })
    expect(endOf({ ...base, wasStopped: true })).toEqual({ isOk: false, text: "Stopped after 3 s" })
  })
})

describe("isShellLike", () => {
  it("takes a block whose lines are all commands", () => {
    expect(isShellLike("cd ~/Desktop/deale/company-service\nSTAGE=prod AWS_DEFAULT_REGION=eu-west-1 EXECUTE=true .venv/bin/python scripts/x.py 2>&1 | tee tmp/x.log\n")).toBe(true)
    expect(isShellLike(`aws dynamodb get-item --table-name t --key '{"pk":{"S":"a"}}'`)).toBe(true)
    expect(isShellLike("git status\n# a comment\n\nbun x vitest run")).toBe(true)
    expect(isShellLike("docker run \\\n  --rm \\\n  img")).toBe(true)
    expect(isShellLike("./scripts/deploy.sh staging")).toBe(true)
  })
  it("leaves out paths, prose, code and output", () => {
    expect(isShellLike("~/Desktop/deale/tmp/a.json\n~/Desktop/deale/tmp/a.csv")).toBe(false)
    expect(isShellLike("/private/tmp/x/empresas.xlsx")).toBe(false)
    expect(isShellLike("const a = 1\nconsole.log(a)")).toBe(false)
    expect(isShellLike("Error: something failed\n  at foo (bar.ts:1)")).toBe(false)
    expect(isShellLike("git status\nThis is not a command")).toBe(false)
    expect(isShellLike("")).toBe(false)
  })
})

describe("riskOf", () => {
  it("names what makes a command touch something real", () => {
    expect(riskOf("STAGE=prod EXECUTE=true .venv/bin/python x.py")).toBe("prod")
    expect(riskOf("aws dynamodb get-item --table-name feature-flags-prod")).toBe("prod")
    expect(riskOf("aws dynamodb put-item --table-name t")).toBe("put-item")
    expect(riskOf("rm -rf build")).toBe("rm -rf")
    expect(riskOf("git push --force origin main")).toBe("--force")
    expect(riskOf("python x.py --execute")).toBe("--execute")
  })
  it("lets the rest run at once", () => {
    expect(riskOf("git status")).toBeNull()
    expect(riskOf("bun x vitest run")).toBeNull()
    expect(riskOf("cat products.json")).toBeNull()
  })
})
