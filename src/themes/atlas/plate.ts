import type { InterestSection, Project, SiteContent } from '../../content/types'
import {
  buildGrid,
  hachures,
  isoPath,
  peaks,
  rivers,
  seaStipple,
  settleable,
  type Grid,
} from './relief'
import {
  bbox,
  fractalLine,
  mulberry32,
  territory,
  toPath,
  type Pt,
  type Territory,
} from './terrain'

// The plate: one continent carrying the whole CV and every project, an offshore
// archipelago of interests, and an unsurveyed coast to the north. Composition is
// authored; every silhouette, ridge, river and town site is generated.

export const WORLD = { w: 2600, h: 1625 }

const MAIN = { cx: 1180, cy: 900, rx: 660, ry: 440 }

export interface City {
  name: string
  at: Pt
  rank: 0 | 1 | 2
  /** set when the city is a project, and clicking it should navigate */
  slug?: string
  note?: string
}

export interface Plate {
  grid: Grid
  main: Territory
  isles: { t: Territory; section: InterestSection; label: Pt }[]
  coastPath: string
  islePaths: string[]
  shore: string[]
  stipple: string
  contours: { d: string; level: number }[]
  hach: { light: string; heavy: string }
  riv: { small: string; mid: string; large: string }
  summits: { at: Pt; h: number }[]
  divider: string
  terra: string
  cities: City[]
  regions: { north: Pt; south: Pt }
}

export function buildPlate(content: SiteContent): Plate {
  const main = territory({ id: 'damyan-hristov', ...MAIN, n: 13, roughness: 0.34 })
  const box = bbox(main.points)

  // interests become an offshore group to the north-east
  const sections = content.interests
  const isles = sections.map((section, i) => {
    const t = sections.length === 1 ? 0.5 : i / (sections.length - 1)
    const cx = 2210 + (i % 2 === 0 ? -85 : 85)
    const cy = 430 + t * 430
    const terr = territory({ id: section.id, cx, cy, rx: 95, ry: 62, n: 9, roughness: 0.32 })
    const b = bbox(terr.points)
    return { t: terr, section, label: { x: cx, y: b.maxY + 30 } }
  })

  const polys = [main.points, ...isles.map((i) => i.t.points)]
  const grid = buildGrid({
    polys,
    x0: 0,
    y0: 0,
    x1: WORLD.w,
    y1: WORLD.h,
    cell: 8,
    seed: 20260805,
    shore: 10,
    scale: 300,
  })

  // --- relief ---
  const contours = [0.12, 0.25, 0.38, 0.52, 0.66, 0.8, 0.92].map((level) => ({
    level,
    d: isoPath(grid.height, grid, level, (i) => grid.land[i] === 1),
  }))
  const hach = hachures(grid, 4, 0.007)
  const riv = rivers(grid, 70)
  const summits = peaks(grid, 0.52, 15)

  // successive lines following the shore — engraved coastal shading
  const shore = [1.6, 3.4, 5.6, 8.2].map((d) => isoPath(grid.offshore, grid, d))
  const stipple = seaStipple(grid, 771, 22, 0.05)

  // --- provinces ---
  const divider = toPath(
    fractalLine(
      { x: box.minX - 40, y: MAIN.cy - 40 },
      { x: box.maxX + 40, y: MAIN.cy + 70 },
      mulberry32(77),
      0.16,
      6,
    ),
    false,
  )
  const terra = toPath(
    fractalLine({ x: 620, y: 300 }, { x: 1900, y: 190 }, mulberry32(1312), 0.22, 6),
    false,
  )

  // --- towns ---
  // Ask the terrain for habitable ground, then hand out the sites: CV places
  // settle in their own province, projects take what is left.
  const sites = settleable(grid, 40, 4242, 16)
  const dividerY = (p: Pt) =>
    MAIN.cy - 40 + ((p.x - (box.minX - 40)) / (box.maxX - box.minX + 80)) * 110
  const onMain = sites.filter((p) => {
    const ix = Math.floor(p.x / grid.cell)
    const iy = Math.floor(p.y / grid.cell)
    return grid.land[iy * grid.w + ix] === 1 && p.x < 2000
  })
  const north = onMain.filter((p) => p.y < dividerY(p))
  const south = onMain.filter((p) => p.y >= dividerY(p))

  const take = (pool: Pt[], n: number) => pool.splice(0, n)
  const cities: City[] = []

  const eduNames = content.cv.education.map((e) => ({
    name: e.location.split(',')[0].trim().toUpperCase(),
    note: e.program,
  }))
  take(north, eduNames.length).forEach((at, i) =>
    cities.push({ name: eduNames[i].name, at, rank: 0, note: eduNames[i].note }),
  )

  const expNames = content.cv.experience.map((e) => ({
    name: e.company.split('(')[0].trim().toUpperCase(),
    note: e.role,
  }))
  take(south, expNames.length).forEach((at, i) =>
    cities.push({ name: expNames[i].name, at, rank: 0, note: expNames[i].note }),
  )

  // projects spread across whichever habitable ground remains
  const released: Project[] = content.projects.filter((p) => p.status === 'released')
  const rest = [...north, ...south].sort((a, b) => a.x - b.x)
  const stride = Math.max(1, Math.floor(rest.length / Math.max(1, released.length)))
  released.forEach((p, i) => {
    const at = rest[Math.min(rest.length - 1, i * stride)]
    if (at) cities.push({ name: p.title, at, rank: 1, slug: p.slug })
  })

  const regionAnchor = (frac: number): Pt => ({ x: MAIN.cx, y: MAIN.cy + MAIN.ry * frac })

  return {
    grid,
    main,
    isles,
    coastPath: main.path,
    islePaths: isles.map((i) => i.t.path),
    shore,
    stipple,
    contours,
    hach,
    riv,
    summits,
    divider,
    terra,
    cities,
    regions: { north: regionAnchor(-0.62), south: regionAnchor(0.66) },
  }
}
