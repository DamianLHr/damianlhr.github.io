import type { Announcement } from './types'

// "Up next" — the blog pulse. Newest first. Every theme surfaces these on the
// landing and projects pages (see docs/ADDING-CONTENT.md).
export const announcements: Announcement[] = [
  {
    id: 'extensible-terrain-generation',
    title: 'Extensible Terrain Generation',
    body: 'A C++ and Vulkan playground for terrain pipelines that can grow new generators over time. First personal graphics project on the road to Delft.',
  },
  {
    id: 'gmtk-2026',
    title: 'GMTK 2026 with team Kartof',
    body: 'The team is back for this year’s GMTK Game Jam. Whatever the theme turns out to be, a new game lands here right after the weekend.',
  },
]
