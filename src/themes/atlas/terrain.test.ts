import { describe, expect, it } from 'vitest'
import {
  area,
  baseBlob,
  bbox,
  displace,
  hashString,
  isSimplePolygon,
  mulberry32,
  perimeter,
  pointInPolygon,
  territory,
  toPath,
} from './terrain'

// Terrain is generated, so it cannot be eyeballed once and trusted forever —
// these lock the properties that make an outline read as a coast rather than as
// a knot or a blob: determinism, no self-crossings, stable area, and perimeter
// that grows with resolution (the coastline paradox).

const SLUGS = [
  'education',
  'experience',
  'dont-break-glass',
  'kill-bunny',
  'digital-twinning-suspension',
  'blood-of-hedon',
  'olympian-onslaught',
  'extensible-terrain-generation',
]

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('stays in [0,1) and is roughly uniform', () => {
    const rng = mulberry32(7)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 20000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      buckets[Math.floor(v * 10)]++
    }
    // each decile should hold ~2000; allow generous slack
    buckets.forEach((b) => expect(b).toBeGreaterThan(1500))
  })
})

describe('territory generation', () => {
  it('is stable for the same content id', () => {
    const a = territory({ id: 'experience', cx: 400, cy: 300, rx: 200, ry: 140 })
    const b = territory({ id: 'experience', cx: 400, cy: 300, rx: 200, ry: 140 })
    expect(a.path).toBe(b.path)
    expect(a.path.length).toBeGreaterThan(100)
  })

  it('gives different content different coastlines', () => {
    const a = territory({ id: 'education', cx: 400, cy: 300, rx: 200, ry: 140 })
    const b = territory({ id: 'experience', cx: 400, cy: 300, rx: 200, ry: 140 })
    expect(a.path).not.toBe(b.path)
  })

  it('never folds through itself, for every real content id', () => {
    for (const id of SLUGS) {
      const t = territory({ id, cx: 500, cy: 400, rx: 240, ry: 170 })
      expect(isSimplePolygon(t.points), `${id} self-intersects`).toBe(true)
    }
  })

  it('survives a sweep of seeds and roughness without self-crossing', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const roughness of [0.2, 0.3, 0.42]) {
        const t = territory({ id: 's', seed, cx: 300, cy: 300, rx: 180, ry: 120, roughness })
        expect(isSimplePolygon(t.points), `seed ${seed} @ ${roughness}`).toBe(true)
      }
    }
  })

  it('keeps a landmass-like area rather than collapsing or ballooning', () => {
    const rx = 200
    const ry = 140
    const nominal = Math.PI * rx * ry
    for (const id of SLUGS) {
      const t = territory({ id, cx: 400, cy: 300, rx, ry })
      const a = area(t.points)
      expect(a).toBeGreaterThan(nominal * 0.35)
      expect(a).toBeLessThan(nominal * 1.7)
    }
  })

  it('stays within a sane distance of its anchor', () => {
    const t = territory({ id: 'education', cx: 400, cy: 300, rx: 200, ry: 140 })
    const b = bbox(t.points)
    // jitter + displacement can push out, but never by more than ~80%
    expect(b.minX).toBeGreaterThan(400 - 200 * 1.8)
    expect(b.maxX).toBeLessThan(400 + 200 * 1.8)
    expect(b.minY).toBeGreaterThan(300 - 140 * 1.8)
    expect(b.maxY).toBeLessThan(300 + 140 * 1.8)
  })
})

describe('fractal character', () => {
  it('grows perimeter with resolution while holding area (coastline paradox)', () => {
    const base = baseBlob(0, 0, 200, 150, 9, mulberry32(3), 0.28)
    const coarse = displace(base, mulberry32(9), 0.3, 2)
    const fine = displace(base, mulberry32(9), 0.3, 6)

    expect(fine.length).toBeGreaterThan(coarse.length * 4)
    // More detail measured => longer coast. The growth is real but modest:
    // perpendicular midpoint displacement cannot reach a true coastline
    // dimension (~1.25) without folding through itself, so this asserts the
    // direction of the effect, not a naturalistic magnitude.
    expect(perimeter(fine)).toBeGreaterThan(perimeter(coarse) * 1.02)
    // ...but essentially the same land
    const ratio = area(fine) / area(coarse)
    expect(ratio).toBeGreaterThan(0.75)
    expect(ratio).toBeLessThan(1.25)
  })

  it('produces a coast rougher than its control polygon', () => {
    const base = baseBlob(0, 0, 200, 150, 9, mulberry32(5), 0.28)
    const coast = displace(base, mulberry32(5), 0.32, 5)
    // isoperimetric ratio: 1 is a circle, higher means more indented
    const q = (pts: typeof base) => perimeter(pts) ** 2 / (4 * Math.PI * area(pts))
    expect(q(coast)).toBeGreaterThan(q(base))
  })
})

describe('path + helpers', () => {
  it('emits a closed cubic path', () => {
    const t = territory({ id: 'x', cx: 100, cy: 100, rx: 50, ry: 40 })
    expect(t.path.startsWith('M ')).toBe(true)
    expect(t.path.endsWith(' Z')).toBe(true)
    expect(t.path).toContain(' C ')
    expect(t.path).not.toContain('NaN')
  })

  it('open paths are not closed', () => {
    expect(
      toPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 20, y: 0 },
        ],
        false,
      ),
    ).not.toContain('Z')
  })

  it('point-in-polygon agrees with an obvious square', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false)
  })

  it('hashString is stable and non-negative', () => {
    expect(hashString('kill-bunny')).toBe(hashString('kill-bunny'))
    expect(hashString('kill-bunny')).toBeGreaterThanOrEqual(0)
  })
})
