import { expect, it } from "vitest"
import { withAlpha } from "./Backdrop"

it("reads a theme colour as the shader takes it, with its alpha", () => {
  expect(withAlpha("#1c1c1a", 0.06)).toBe("rgba(28, 28, 26, 0.06)")
  expect(withAlpha("#fff", 0.1)).toBe("rgba(255, 255, 255, 0.1)")
})
