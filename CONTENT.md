# CONTENT.md — Draft site copy & data

> The "data" side of the content ⇄ theme decoupling (TECHNOLOGY.md §3). Everything here
> gets transcribed into typed `src/content/` files at scaffold time. Themes consume this;
> they never define it. `TODO` marks gaps Damyan still needs to fill.

## Profile

- **Name:** Damyan Hristov
- **Tagline:** Portfolio Blog
- **GitHub:** [DamianLHr](https://github.com/DamianLHr) — pfp via `https://github.com/DamianLHr.png`
- **itch.io:** [damianhr](https://damianhr.itch.io/)
- **Steam:** https://steamcommunity.com/id/damianlhr/
- **Spotify:** https://open.spotify.com/user/nmu09x11y3ie6r4l6dxy2co8v?si=0d363aaba7d143bc
- **LinkedIn:** TODO — Damyan will create one soon; leave a slot in the landing socials

## CV — `/cv`

### Education

**BSc Computer Science and Engineering — Eindhoven University of Technology (TU/e)**
*September 2024 – 2027 (expected) · currently 2nd year, class finishing in 2027*

**National Gymnasium of Natural Sciences and Mathematics "Academician Lyubomir Chakalov", Sofia**
*September 2019 – May 2024 · secondary education*
Mathematics & Informatics major class with German language; additional specialization in
Information Technologies (10th–12th grade). Mandatory exam: Advanced Mathematics — State
Baccalaureate Examination, 20.05.2024.

### Experience

**Lead Programmer — [Totem](https://nl.linkedin.com/company/totem-game-dev)**
*1 September 2025 – 30 June 2026 (~10 months) · Unity (C#) + Netcode for GameObjects*
Worked on an asymmetric multiplayer game, still in beta. Contributions (systems in
`TotemPT_Project2025/Assets/Scripts`):

- **Networked event bus** — pub/sub backbone (global gameplay events over Netcode) that
  keeps game systems loosely coupled across the network.
- **Lobby & session flow** — Unity Services initialization, session create/join, and the
  asymmetric **player-role assignment** UI/logic.
- **2D ⇄ 3D grid-mapping pipeline** — tilemap-to-3D world conversion with forward and
  inverse mappers, linking the two players' asymmetric views of the same space.
- **Sub-scene "arcade machine" system** — minigames running on in-world arcade screens
  via render textures, with sub-scene lifecycle, validation, and client-authority
  management.
- **Arcade minigames** — Pac-Man (five distinct ghost-AI personalities: chaser, ambusher,
  flanker, patroller, switcher), Tetris (including a bot and SRS wall-kick data),
  pinball, 3D fruit-ninja, basketball.
- **Asymmetric audio** (role-dependent emitters/BGM) and the **3D interaction & item
  systems** (inspection, held-in-hand, highlighting).

Team: ~15 people total. Repo `TotemPT_Project2025` = "Totem Game Dev Project Team 2025".

**Intern — INDEAVR, Sofia (Data Strategy Services department)**
*June 2022 – July 2022*
INDEAVR provides IT outsourcing services to many Fortune 2000 companies.

- *What I did:* Made numerous client companies' sites GDPR-compliant by setting up their
  cookie consent; helped migrate the department's wiki.
- *What I learned — technical:* Google Analytics, some JavaScript, marketing-adjacent
  concepts; in-house libraries, git, and Microsoft's software package for the wiki work.
- *What I learned — social:* first-hand look at company operation via presentations from
  each of the department's team members.
- *Teamwork:* worked with an assigned tutor on my tasks, then with the small team
  responsible for the department's wiki.

### Plans

Masters in Delft with Computer Graphics; career direction: game / engine / tooling
development.

### Proficiencies

*Programming highlights cross-link to the projects that prove them (§3.5 rule).*

- **Spoken languages:** Bulgarian (native) · English (C1) · German (B1)
- **Programming — highlights:**
  - **Java** — evidenced by massive projects → Blood of Hedon (custom game engine from
    scratch, Java 21) and [Olympian Onslaught](https://github.com/DamianLHr/Olympian-Onslaught)
  - **C# & Unity** → Totem (asymmetric multiplayer, Netcode),
    [Digital Twinning Suspension](https://github.com/DamianLHr/Digital-Twinning-Suspension),
    [Kill Bunny](https://github.com/DamianLHr/TGJ2026_Kartof), Don't Break Glass
  - **Python** — stochastic simulations, plotting / data analysis → Digital Twinning
    Suspension analysis, stochastic modelling coursework
- **Actively expanding:** C++ · Vulkan (graphics API) — aligned with the Delft
  computer-graphics direction; first vehicle: Extensible Terrain Generation (below)

## Projects — `/projects` (+ one subpage each)

Schema per project: `{ year, role, duration, tools/platform, category, team?, links, art }`

### Personal
- **Extensible Terrain Generation** — *coming soon* · **C++ + Vulkan** · not started yet;
  announced alongside the GMTK 2026 entry

### Game jams — team "Kartof"
- **Don't Break Glass** — GMTK Game Jam 2025 (2025, ~96 h) · Unity (C#) ·
  [itch.io](https://damianhr.itch.io/dont-break-glass) (Windows download, 72 MB;
  rated 5.0/5) · Puzzle adventure inspired by classic flash point-and-click games and
  escape rooms: the protagonist is trapped in a **time loop** and must solve puzzles to
  escape. No generative AI used. · Team: damianhr, Davidd, smarty123, BungerColumbus,
  Eyn_Zayan · Repo: private on a teammate's account
  (`github.com/Davidd0605/GMTK2025_Kartof`; local clone `GMTK2025_Kartof`, includes the
  Windows build `Don'tBreakGlass.exe`) — site links point to itch.io ·
  **Role: Scrum Master & Programmer**
- **Kill Bunny** — Totem Game Jam 2026 (2026) · Unity (C#) ·
  [itch.io](https://damianhr.itch.io/kill-bunny) — **playable in browser (HTML5)** →
  embed it playable in the portfolio; also 65 MB download ·
  [repo](https://github.com/DamianLHr/TGJ2026_Kartof) · **Isometric hack-n-slash with
  RAGE elements** (itch one-liner): manage your character's rage while eliminating
  enemies in a forest; comic-panel art style; "Opportunity makes a thief, but a thief
  makes his own gallows." No generative AI used. · Team: damianhr, BungerColumbus,
  smarty123, Midas5665, Eyn_Zayan, Davidd · **Role: Scrum Master & Programmer**
- **GMTK 2026 entry** — *very soon…*

### University (each a ~2-month course project)
- **Digital Twinning Suspension** (a.k.a. Twinning Project 2) — **2026** ·
  [repo](https://github.com/DamianLHr/Digital-Twinning-Suspension) (Unity 6000.4.6f1,
  C# + Python analysis) · Multidisciplinary CBL project: a digital twin of an **active
  predictive suspension**, twinned against a real belt-driven test rig ·
  **Role: Scrum Master & Programmer** · Measured results (predictive vs constant
  damping, best-case despiked segment): **RMS sprung acceleration −4.46%, mean peak
  |acceleration| −16.03%**; jolt landing accuracy within ~2 cm of belt travel ·
  Deliverables already on [GitHub Releases](https://github.com/DamianLHr/Digital-Twinning-Suspension/releases/latest):
  Windows `Build.zip` + final presentation PPTX; demo video embedded in the README
- **Blood of Hedon** — **2025** · 2IRR00 *Software Engineering*, TU/e, Group 55 (6
  members) · **Java 21, on a custom game engine built from scratch** — no external
  framework: fixed-timestep loop, BufferStrategy renderer with layered draw order,
  spatial-grid collision (rotated rects, threaded resolution), global + per-entity
  event buses, Unity-style entity/functionality component model, prefabs; Maven, JUnit
  5, Checkstyle · Roguelike gladiator game with turn-based, card-driven combat in a
  hand-drawn Roman arena (~35 cards, 4 gladiator classes, mythological bestiary) ·
  **Role: Scrum Master & Programmer** — ran sprint planning/stand-ups/retros and the
  backlog, coordinated 6 people shipping on a single branch; built gameplay systems and
  engine parts · Executable: prebuilt JAR on
  [GitHub Releases](https://github.com/DamianLHr/Blood-of-Hedon/releases/latest) ·
  Repo currently **private** → TODO: make public (or mirror the release) so site links
  work
- **Olympian Onslaught** — **2025** · *Programming* course, team of two (with Teodor —
  data & content, art) · [repo](https://github.com/DamianLHr/Olympian-Onslaught) ·
  Top-down survival roguelite in a Greek-mythology world: as Achilles, survive
  five minutes of monster waves with auto-firing weapons; level-ups grant weapons/
  abilities and maxed pairs fuse into evolved weapons (Exploding Bow, Lightning Axe);
  timed bosses (Gryphon, Cyclops, Basilisk) · Runs on a **custom Java 21/Swing engine
  built from scratch** — component game objects + prefabs, threaded spatial-grid
  collision, fixed-timestep loop, scene handling, level/spawn direction (NetBeans/Ant)
  · **Role: Team Leader & Programmer** — set direction and scope cuts; built the
  engine and the level/spawn/weapon/ability managers · Executable: prebuilt JAR on
  GitHub Releases

## Interests — `/interests` (one subpage, four sections)

- **Books:** favourite book series — TODO: which
- **Gaming:** favourite games — TODO: which · [Steam profile](https://steamcommunity.com/id/damianlhr/)
- **Skiing:** mention background — TODO: the story (racing? instructor? since when?)
- **Music:** [Spotify profile](https://open.spotify.com/user/nmu09x11y3ie6r4l6dxy2co8v?si=0d363aaba7d143bc)

## Art DNA assignments

TODO (design-time): per-project + per-route `{ seed, palette, accent, fractal? }` facets
(TECHNOLOGY.md §3.1) — assigned when the fractal identities are designed in Mandelbulber.
