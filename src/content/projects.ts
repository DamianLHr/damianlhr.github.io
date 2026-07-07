import type { Project } from './types'

export const projects: Project[] = [
  {
    slug: 'extensible-terrain-generation',
    title: 'Extensible Terrain Generation',
    category: 'personal',
    status: 'coming-soon',
    tools: ['C++', 'Vulkan'],
    summary:
      'An extensible terrain-generation playground in C++ and Vulkan — the first vehicle for the graphics-programming direction. Not started yet.',
    links: [],
  },
  {
    slug: 'dont-break-glass',
    title: "Don't Break Glass",
    category: 'jam',
    status: 'released',
    year: 2025,
    event: 'GMTK Game Jam 2025',
    duration: '~96 h jam',
    role: 'Scrum Master & Programmer',
    team: {
      name: 'Kartof',
      size: 5,
      members: ['damianhr', 'Davidd', 'smarty123', 'BungerColumbus', 'Eyn_Zayan'],
    },
    tools: ['Unity', 'C#'],
    summary:
      'A puzzle adventure inspired by classic flash point-and-click games and escape rooms: trapped in a time loop, you solve puzzles to escape. Rated 5.0/5 on itch.io. No generative AI used.',
    links: [{ label: 'Play on itch.io', url: 'https://damianhr.itch.io/dont-break-glass' }],
  },
  {
    slug: 'kill-bunny',
    title: 'Kill Bunny',
    category: 'jam',
    status: 'released',
    year: 2026,
    event: 'Totem Game Jam 2026',
    role: 'Scrum Master & Programmer',
    team: {
      name: 'Kartof',
      size: 6,
      members: ['damianhr', 'BungerColumbus', 'smarty123', 'Midas5665', 'Eyn_Zayan', 'Davidd'],
    },
    tools: ['Unity', 'C#'],
    summary:
      'Isometric hack-n-slash with RAGE elements: manage your character’s rage while cutting through thieves in a forest, told in comic-panel art. "Opportunity makes a thief, but a thief makes his own gallows." No generative AI used.',
    links: [
      { label: 'Play in browser on itch.io', url: 'https://damianhr.itch.io/kill-bunny' },
      { label: 'Repository', url: 'https://github.com/DamianLHr/TGJ2026_Kartof' },
    ],
  },
  {
    slug: 'gmtk-2026',
    title: 'GMTK 2026 entry',
    category: 'jam',
    status: 'coming-soon',
    event: 'GMTK Game Jam 2026',
    team: { name: 'Kartof' },
    tools: [],
    summary: 'Team Kartof rides again — very soon.',
    links: [],
  },
  {
    slug: 'digital-twinning-suspension',
    title: 'Digital Twinning Suspension',
    category: 'university',
    status: 'released',
    year: 2026,
    event: 'Multidisciplinary CBL project, TU/e',
    duration: '~2 months',
    role: 'Scrum Master & Programmer',
    tools: ['Unity 6000.4.6f1', 'C#', 'Python'],
    summary:
      'A digital twin of an active predictive suspension, twinned against a real belt-driven test rig. The predictive damping policy measurably beats a constant damper: −4.46% RMS sprung acceleration and −16.03% mean peak acceleration (best-case despiked segment), with jolt placement within ~2 cm of belt travel.',
    links: [
      { label: 'Repository', url: 'https://github.com/DamianLHr/Digital-Twinning-Suspension' },
      {
        label: 'Windows build + final presentation (Releases)',
        url: 'https://github.com/DamianLHr/Digital-Twinning-Suspension/releases/latest',
      },
    ],
  },
  {
    slug: 'blood-of-hedon',
    title: 'Blood of Hedon',
    category: 'university',
    status: 'released',
    year: 2025,
    event: '2IRR00 Software Engineering, TU/e (Group 55)',
    duration: '~2 months',
    role: 'Scrum Master & Programmer',
    team: { size: 6 },
    tools: ['Java 21', 'Maven', 'JUnit 5'],
    summary:
      'A roguelike gladiator game with turn-based, card-driven combat in a hand-drawn Roman arena (~35 cards, 4 gladiator classes, a mythological bestiary) — running on a custom game engine built from scratch: fixed-timestep loop, layered renderer, spatial-grid collision, event buses, Unity-style component model.',
    links: [
      {
        label: 'Download the game (JAR, GitHub Releases)',
        url: 'https://github.com/DamianLHr/Blood-of-Hedon/releases/latest',
      },
    ],
  },
  {
    slug: 'olympian-onslaught',
    title: 'Olympian Onslaught',
    category: 'university',
    status: 'released',
    year: 2025,
    event: 'Programming course, TU/e',
    duration: '~2 months',
    role: 'Team Leader & Programmer',
    team: { size: 2 },
    tools: ['Java 21', 'Swing'],
    summary:
      'A top-down survival roguelite in a Greek-mythology world: as Achilles, survive five minutes of monster waves with auto-firing weapons; maxed weapon–ability pairs fuse into evolutions like the Exploding Bow and Lightning Axe. Built on a custom Java/Swing engine written from scratch.',
    links: [{ label: 'Repository', url: 'https://github.com/DamianLHr/Olympian-Onslaught' }],
  },
]
