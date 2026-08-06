import type { ThemeDescriptor } from '../shared/theme-contract'

// The theme registry (TECHNOLOGY.md §3.3). Adding a theme = one new descriptor here
// + its folder. The shell resolves against this list; nothing else may import
// theme folders directly.

export const themes: ThemeDescriptor[] = [
  {
    id: 'julia',
    name: 'Julia',
    description: '2D fractal gallery — obsidian, ember, real Julia sets. The universal floor.',
    requirements: {},
    weight: 20,
    listed: true,
    load: () => import('./julia'),
  },
  {
    id: 'singularity',
    name: 'Singularity',
    description:
      'Demanding: fly through a raymarched fold-bulb world. Parked pending a performance pass.',
    requirements: { webgl2: true },
    // Parked 2026-08-05: too heavy to be anyone's default. Negative weight keeps it
    // out of auto-resolution entirely — reachable only via the switcher or ?theme=.
    weight: -2,
    listed: true,
    load: () => import('./singularity'),
  },
  {
    id: 'watershed',
    name: 'Watershed',
    description:
      'An island eroded by a real hydraulic simulation — orbit the valleys its rivers cut.',
    requirements: { webgl2: true },
    // in build (PLAN Phase 6); reachable from the switcher until its gate
    weight: 6,
    listed: true,
    load: () => import('./watershed'),
  },
  {
    id: 'atlas',
    name: 'Atlas',
    description:
      'The résumé as territory — a 17th-century chart with procedurally engraved coastlines.',
    requirements: {},
    // in build (PLAN Phase 5); reachable from the switcher until GATE 5b
    weight: 5,
    listed: true,
    load: () => import('./atlas'),
  },
  {
    id: 'hold',
    name: 'Holding page',
    description: 'Minimal placeholder world while the real themes are built.',
    requirements: {},
    weight: 10,
    listed: true,
    load: () => import('./hold'),
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Raw content & route inspector — proves the content ⇄ theme decoupling.',
    requirements: {},
    weight: -1,
    listed: true,
    load: () => import('./debug'),
  },
]
