import { describe, expect, it } from "bun:test"
import { checksRollup, gamingIn, overLimits } from "../lib/checks"

const diff = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-export const a = 1
+export const a = 2
diff --git a/tests/old.test.ts b/tests/old.test.ts
deleted file mode 100644
--- a/tests/old.test.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-it("works", () => {
-  expect(a).toBe(1)
-})
diff --git a/tests/b.test.ts b/tests/b.test.ts
--- a/tests/b.test.ts
+++ b/tests/b.test.ts
@@ -1,4 +1,4 @@
-it("counts", () => {
+it.skip("counts", () => {
-  expect(total).toBe(37)
+  expect(total).toBeDefined()
-  expect(rows).toHaveLength(2)
 })
diff --git a/tests/test_c.py b/tests/test_c.py
--- a/tests/test_c.py
+++ b/tests/test_c.py
@@ -1,2 +1,3 @@
+@pytest.mark.xfail
 def test_c():
     assert c() == 1
`

describe("gamingIn", () => {
  it("finds tests deleted, switched off, or left with fewer assertions", () => {
    expect(gamingIn(diff)).toEqual({
      deleted: ["tests/old.test.ts"],
      skipped: ["tests/b.test.ts", "tests/test_c.py"],
      assertionsLost: 1,
    })
  })
  it("finds nothing in a diff that only adds tests", () => {
    expect(gamingIn(`diff --git a/x.test.ts b/x.test.ts\n--- a/x.test.ts\n+++ b/x.test.ts\n@@ -0,0 +1 @@\n+  expect(x).toBe(1)\n`)).toEqual({ deleted: [], skipped: [], assertionsLost: 0 })
  })
})

describe("checksRollup", () => {
  it("says whether a PR's checks passed, failed or still run", () => {
    expect(checksRollup([{ conclusion: "SUCCESS" }, { state: "SUCCESS" }])).toBe("pass")
    expect(checksRollup([{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }])).toBe("fail")
    expect(checksRollup([{ status: "IN_PROGRESS" }])).toBe("pending")
    expect(checksRollup([])).toBe("none")
  })
})

describe("overLimits", () => {
  it("warns of a run that took too long or cost too much, and nothing else", () => {
    expect(overLimits(30 * 60_000, 4)).toEqual([])
    expect(overLimits(120 * 60_000, 20).map(c => c.id)).toEqual(["time", "cost"])
  })
})
