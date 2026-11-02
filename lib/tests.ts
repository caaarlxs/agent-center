// A test run Claude made, read from its command and what it printed: how many
// passed, failed and were skipped, and the names of those that failed. The
// usual runners: bun test, vitest, jest, pytest, cargo test, go test (and
// npm/pnpm/yarn test, which run one of them). Null when the command runs no
// tests, or its output has no summary to read.

export type TestRun = { runner: string; passed: number; failed: number; skipped: number; failures: string[] }

const RUNNER = /\b(bun (?:run )?test|vitest|jest|pytest|py\.test|cargo (?:nextest run|test)|go test|(?:npm|pnpm|yarn)(?: run)? test|playwright test)\b/
const MAX_FAILURES = 12

export const runnerOf = (command: string): string | null => command.match(RUNNER)?.[1]?.replace(/ run /, " ") ?? null

const n = (text: string, re: RegExp) => [...text.matchAll(re)].reduce((sum, m) => sum + Number(m[1]), 0)
const has = (text: string, re: RegExp) => re.test(text)

// The counts, by the first summary the output has.
function countsOf(out: string): Omit<TestRun, "runner" | "failures"> | null {
  // vitest: "Tests  1 failed | 23 passed | 2 skipped (26)"
  const vitest = out.match(/^\s*Tests\s+(.+)\(\d+\)\s*$/m)
  if (vitest) return { passed: n(vitest[1]!, /(\d+) passed/g), failed: n(vitest[1]!, /(\d+) failed/g), skipped: n(vitest[1]!, /(\d+) (?:skipped|todo)/g) }
  // jest: "Tests:       2 failed, 1 skipped, 10 passed, 13 total"
  const jest = out.match(/^Tests:\s+(.+total)\s*$/m)
  if (jest) return { passed: n(jest[1]!, /(\d+) passed/g), failed: n(jest[1]!, /(\d+) failed/g), skipped: n(jest[1]!, /(\d+) (?:skipped|todo)/g) }
  // bun: " 116 pass" / " 0 fail" / " 2 skip"
  if (has(out, /^\s*\d+ pass\s*$/m)) return { passed: n(out, /^\s*(\d+) pass\s*$/gm), failed: n(out, /^\s*(\d+) fail\s*$/gm), skipped: n(out, /^\s*(\d+) skip\s*$/gm) }
  // pytest: "==== 2 failed, 10 passed, 1 skipped in 3.21s ===="
  const pytest = out.match(/^=+ (.*\d+ (?:passed|failed|error).*) in [\d.]+s.*=+\s*$/m)
  if (pytest) return { passed: n(pytest[1]!, /(\d+) passed/g), failed: n(pytest[1]!, /(\d+) (?:failed|errors?)/g), skipped: n(pytest[1]!, /(\d+) (?:skipped|xfailed|deselected)/g) }
  // cargo: "test result: FAILED. 10 passed; 2 failed; 1 ignored" (one per crate)
  if (has(out, /^test result: /m)) return { passed: n(out, /^test result: .*?(\d+) passed/gm), failed: n(out, /^test result: .*?(\d+) failed/gm), skipped: n(out, /^test result: .*?(\d+) ignored/gm) }
  // go: a line per package, "ok  pkg" or "FAIL\tpkg"
  if (has(out, /^(ok|FAIL)\s+\S+/m)) return { passed: (out.match(/^ok\s+\S+/gm) ?? []).length, failed: (out.match(/^FAIL\s+\S+\s/gm) ?? []).length, skipped: 0 }
  return null
}

// The names of the tests that failed, as each runner prints them.
function failuresOf(out: string): string[] {
  const names = [
    ...[...out.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+m?s\])?\s*$/gm)].map(m => m[1]!), // bun
    ...[...out.matchAll(/^\s*FAIL\s+(\S.*?\.(?:test|spec)\.\w+.*?)\s*$/gm)].map(m => m[1]!), // vitest, jest
    ...[...out.matchAll(/^\s*● (?!Test suite failed)(.+?)\s*$/gm)].map(m => m[1]!), // jest
    ...[...out.matchAll(/^FAILED (\S+)/gm)].map(m => m[1]!), // pytest
    ...[...out.matchAll(/^test (\S+) \.\.\. FAILED/gm)].map(m => m[1]!), // cargo
    ...[...out.matchAll(/^\s*--- FAIL: (\S+)/gm)].map(m => m[1]!), // go
  ]
  return [...new Set(names.map(s => s.replace(/\s+/g, " ").trim()))].slice(0, MAX_FAILURES)
}

export function testRunOf(command: string, output: string): TestRun | null {
  const runner = runnerOf(command)
  if (!runner) return null
  const counts = countsOf(output)
  if (!counts || counts.passed + counts.failed + counts.skipped === 0) return null
  return { runner, ...counts, failures: counts.failed ? failuresOf(output) : [] }
}
