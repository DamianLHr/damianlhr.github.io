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
    id: 'spike',
    name: 'Singularity (spike)',
    description: 'Phase 3 prototype: dive into a raymarched Mandelbulb. Expect sharp edges.',
    requirements: { webgl2: true },
    weight: -2,
    listed: true,
    load: () => import('./spike'),
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
