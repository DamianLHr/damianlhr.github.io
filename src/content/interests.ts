import type { InterestSection } from './types'

export const interests: InterestSection[] = [
  {
    id: 'books',
    title: 'Books',
    body: 'Favourite book series — details coming soon.',
    links: [],
  },
  {
    id: 'gaming',
    title: 'Gaming',
    body: 'Favourite games — details coming soon.',
    links: [{ label: 'Steam profile', url: 'https://steamcommunity.com/id/damianlhr/' }],
  },
  {
    id: 'skiing',
    title: 'Skiing',
    body: 'A long-running background on the slopes — story coming soon.',
    links: [],
  },
  {
    id: 'music',
    title: 'Music',
    body: 'What plays while the code compiles.',
    links: [
      {
        label: 'Spotify profile',
        url: 'https://open.spotify.com/user/nmu09x11y3ie6r4l6dxy2co8v?si=0d363aaba7d143bc',
      },
    ],
  },
]
