import type { SiteContent } from './types'
import { SITE } from './meta'
import { cv } from './cv'
import { projects } from './projects'
import { interests } from './interests'
import { announcements } from './announcements'

export type * from './types'

export const content: SiteContent = {
  profile: {
    name: SITE.name,
    tagline: SITE.tagline,
    url: SITE.url,
    pfpUrl: 'https://github.com/DamianLHr.png',
    socials: [
      { label: 'GitHub', url: SITE.github },
      { label: 'itch.io', url: SITE.itch },
      { label: 'Steam', url: 'https://steamcommunity.com/id/damianlhr/' },
      {
        label: 'Spotify',
        url: 'https://open.spotify.com/user/nmu09x11y3ie6r4l6dxy2co8v?si=0d363aaba7d143bc',
      },
      // LinkedIn slot reserved — profile coming soon (CONTENT.md TODO)
    ],
  },
  cv,
  projects,
  interests,
  announcements,
  // Art DNA gets authored at design time (Phase 4); facets are optional until then.
  routeArt: {},
}
