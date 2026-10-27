import { expect, test } from "vitest"
import type { Zone } from "@/lib/api-types"
import { CARD_H, CARD_W, ENTRY, GRID, entryBox, newZone, placeIn } from "./geometry"
import { zoomTarget } from "./zoom"

test("Incoming is as tall as its rows, one at least", () => {
  expect(entryBox(0)).toEqual({ x: ENTRY.x - 12, y: ENTRY.y - 12, w: 2 * (CARD_W + GRID), h: CARD_H + GRID + 12 })
  expect(entryBox(3).h).toBe(2 * CARD_H + GRID + 12)
})

test("a zone drawn snaps to the grid; a click gives the usual size", () => {
  expect(newZone({ x0: 500, y0: 300, x1: 100, y1: 100 })).toMatchObject({ x: 96, y: 96, w: 408, h: 192 })
  expect(newZone({ x0: 100, y0: 100, x1: 105, y1: 100 })).toMatchObject({ w: CARD_W * 2 + GRID * 3, h: CARD_H * 2 + GRID * 2 })
  expect(newZone({ x0: 0, y0: 0, x1: 48, y1: 48 })).toMatchObject({ w: 160, h: 120 })
})

test("a card dropped on a folder takes the first free place; with none, the zone grows", () => {
  const zone: Zone = { id: "z", name: "Z", x: 0, y: 0, w: 700, h: 400 }
  expect(placeIn(zone, [], 120).at).toEqual({ x: GRID, y: 48 })
  expect(placeIn(zone, [{ x: GRID, y: 48, w: CARD_W, h: 120 }], 120).at).toEqual({ x: GRID + CARD_W + GRID, y: 48 })
  const full = placeIn({ ...zone, w: 336, h: 200 }, [{ x: GRID, y: 48, w: CARD_W, h: 120 }], 120)
  expect(full.at).toEqual({ x: GRID, y: 192 })
  expect(full.zone.h).toBe(192 + 120 + GRID)
})

test("zoom: a step stops on Fit when it crosses it, and Fit is kept as null", () => {
  expect(zoomTarget(1.2, 0.9, 1, false)).toEqual({ scale: 1, saved: null })
  expect(zoomTarget(1, 1.2, 1, true)).toEqual({ scale: 1.2, saved: 1.2 })
  expect(zoomTarget(1.4, 2, 1, false)).toEqual({ scale: 1.5, saved: 1.5 })
  expect(zoomTarget(0.5, 0.1, 0.8, false)).toEqual({ scale: 0.4, saved: 0.4 })
  expect(zoomTarget(1.2, null, 0.8, false)).toEqual({ scale: 0.8, saved: null })
})
