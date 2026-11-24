import { expect, test } from "bun:test"
import { bootedOf, commandFor, withoutPreamble } from "../lib/simulator"

test("the simulators running: the booted ones of simctl's list, with their iOS", () => {
  const list = { devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [
      { udid: "5AD17D74-9CCC-4D7F-AB2E-FB524644D794", name: "iPhone 17", state: "Booted" },
      { udid: "0132822C-D800-4F17-BC44-9534BF018BB3", name: "iPhone 17 Pro", state: "Shutdown" },
    ],
    "com.apple.CoreSimulator.SimRuntime.watchOS-26-0": [{ udid: "not a udid", name: "Watch", state: "Booted" }],
  } }
  expect(bootedOf(list)).toEqual([{ udid: "5AD17D74-9CCC-4D7F-AB2E-FB524644D794", name: "iPhone 17", os: "iOS 26.3" }])
  expect(bootedOf({})).toEqual([])
  expect(bootedOf(null)).toEqual([])
})

test("what you do on the picture, as AXe's command: points rounded, times within limits", () => {
  expect(commandFor({ kind: "tap", x: 200.4, y: 399.6 })).toBe("tap -x 200 -y 400")
  expect(commandFor({ kind: "hold", x: 10, y: 20, seconds: 99 })).toBe("tap -x 10 -y 20 --hold 5")
  expect(commandFor({ kind: "swipe", x: 200, y: 600, toX: 200, toY: 300, seconds: 0.01 })).toBe("swipe --start-x 200 --start-y 600 --end-x 200 --end-y 300 --duration 0.1")
  expect(commandFor({ kind: "key", name: "enter" })).toBe("key 40")
  expect(commandFor({ kind: "key", name: "backspace" })).toBe("key 42")
  expect(commandFor({ kind: "button", name: "home" })).toBe("button home")
})

test("anything else is no command: a point off any screen, a key or button not listed, a line break", () => {
  for (const no of [
    { kind: "tap", x: -1, y: 5 }, { kind: "tap", x: "200 --udid other", y: 5 }, { kind: "tap", x: 99999, y: 5 }, { kind: "tap", x: NaN, y: 5 },
    { kind: "key", name: "40\nbutton lock" }, { kind: "button", name: "lock --allow-lock" }, { kind: "launch" }, null, "tap",
  ]) expect(commandFor(no)).toBeNull()
})

test("AXe's stream starts as an HTTP answer: only what follows its headers is the pictures", () => {
  const bytes = (s: string) => new TextEncoder().encode(s)
  const start = bytes("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=mjpegstream\r\n\r\n--mjpegstream\r\nContent-Type: image/jpeg\r\n")
  expect(new TextDecoder().decode(withoutPreamble(start)!)).toBe("--mjpegstream\r\nContent-Type: image/jpeg\r\n")
  expect(withoutPreamble(bytes("HTTP/1.1 200 OK\r\nContent-Ty"))).toBeNull() // not whole yet
  expect(new TextDecoder().decode(withoutPreamble(bytes("--mjpegstream\r\n"))!)).toBe("--mjpegstream\r\n") // none: as it comes
})
