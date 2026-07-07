import type { CV } from './types'

export const cv: CV = {
  education: [
    {
      school: 'Eindhoven University of Technology (TU/e)',
      program: 'BSc Computer Science and Engineering',
      location: 'Eindhoven, the Netherlands',
      start: '2024-09',
      end: '2027 (expected)',
      details: ['Currently in the 2nd year, class finishing in 2027.'],
    },
    {
      school: 'National Gymnasium of Natural Sciences and Mathematics "Academician Lyubomir Chakalov"',
      program: 'Secondary education: Mathematics & Informatics major with German',
      location: 'Sofia, Bulgaria',
      start: '2019-09',
      end: '2024-05',
      details: [
        'Mathematics & Informatics major class with German language.',
        'Additional specialization in Information Technologies (10th to 12th grade).',
        'State Baccalaureate Examination in Advanced Mathematics (20.05.2024).',
      ],
    },
  ],
  experience: [
    {
      company: 'Totem',
      role: 'Lead Programmer',
      start: '2025-09-01',
      end: '2026-06-30',
      teamSize: 15,
      tools: ['Unity', 'C#', 'Netcode for GameObjects'],
      summary: 'Worked on an asymmetric multiplayer game, still in beta, in a ~15-person team.',
      highlights: [
        'Networked pub/sub event bus keeping gameplay systems loosely coupled across the network.',
        'Lobby and session flow: Unity Services initialization, session create/join, asymmetric player-role assignment.',
        "2D ⇄ 3D grid-mapping pipeline (tilemap-to-3D conversion with forward and inverse mappers) linking the two players' asymmetric views.",
        'Sub-scene "arcade machine" system: minigames on in-world screens via render textures, with client-authority management.',
        'Arcade minigames: Pac-Man with five distinct ghost-AI personalities, Tetris with a bot and SRS wall kicks, pinball, 3D fruit-ninja, basketball.',
        'Asymmetric audio (role-dependent emitters/BGM) and the 3D interaction & item systems.',
      ],
      links: [{ label: 'Totem on LinkedIn', url: 'https://nl.linkedin.com/company/totem-game-dev' }],
    },
    {
      company: 'INDEAVR (Data Strategy Services department)',
      role: 'Intern',
      start: '2022-06',
      end: '2022-07',
      tools: ['Google Analytics', 'JavaScript', 'git'],
      summary:
        'Internship at INDEAVR in Sofia, an IT outsourcing provider serving many Fortune 2000 companies.',
      highlights: [
        "Made numerous client companies' sites GDPR-compliant by setting up their cookie consent.",
        "Helped migrate the department's wiki, working with in-house libraries, git, and Microsoft tooling.",
        "Got a first-hand look at company operation via presentations from each of the department's team members.",
        'Worked with an assigned tutor, then with the small team responsible for the wiki.',
      ],
      links: [],
    },
  ],
  plans:
    'Masters in Delft with Computer Graphics; heading toward game, engine, and tooling development.',
  proficiencies: {
    spoken: [
      { language: 'Bulgarian', level: 'native' },
      { language: 'English', level: 'C1' },
      { language: 'German', level: 'B1' },
    ],
    programming: [
      {
        name: 'Java',
        evidence: 'Massive projects, including a custom game engine built from scratch.',
        projectSlugs: ['blood-of-hedon', 'olympian-onslaught'],
      },
      {
        name: 'C# & Unity',
        evidence: 'Professional and jam game development, plus a physical-rig digital twin.',
        projectSlugs: ['digital-twinning-suspension', 'kill-bunny', 'dont-break-glass'],
      },
      {
        name: 'Python',
        evidence: 'Stochastic simulations, plotting and data analysis.',
        projectSlugs: ['digital-twinning-suspension'],
      },
    ],
    expanding: [
      {
        name: 'C++ & Vulkan',
        evidence: 'Actively learning, aligned with the Delft computer-graphics direction.',
        projectSlugs: ['extensible-terrain-generation'],
      },
    ],
  },
}
