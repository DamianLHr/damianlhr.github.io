# TECHNOLOGY.md — Portfolio / Experimental Art Website

> Knowledge base for this project. Written July 2026. Consult this before making
> technology, design, or asset decisions; update it when decisions change.

## 1. Project charter & constraints

**What this is:** Damyan's personal portfolio, built as straight-up creative experimental
art. The bar is "very visually impressive" — WebGPU-first graphics, modern motion design,
award-tier polish. Standalone project (no relation to any other repo).

**The site is multi-theme by architecture (§3):** visual worlds are swappable themes over
one theme-agnostic content model. The full 3D WebGPU experience is the flagship theme —
not the site itself — in a four-world roster (§3.4: Mandelbulb dive, 17th-century
discovery map, industrial/engineering, 2D-fractal floor), with more worlds addable later
without touching content.

**Hard constraints (GitHub Pages hosting):**

- **Static only.** No server, no API routes, no SSR at runtime. Everything ships as
  prebuilt HTML/JS/CSS/assets. Dynamic behavior = client-side only.
- **Repo/asset discipline:** ~1 GB recommended site size, 100 MB hard per-file limit,
  ~100 GB/month soft bandwidth. Heavy media must be compressed aggressively (see §5).
- **Deploy:** GitHub Actions → `actions/deploy-pages`. As a *user site* repo
  (`damianlhr.github.io`) it serves at `https://damianlhr.github.io/` from the domain
  root — **no Vite `base` path juggling needed**. (If ever moved to a project repo,
  set `base: '/<repo>/'` in Vite.)
- HTTPS enforced; custom domain possible later via CNAME.

---

## 2. Core rendering technology

### WebGPU — primary target

The modern GPU API for the web: WGSL shaders, **compute shaders**, storage buffers,
render bundles, far lower driver overhead than WebGL. Backed by D3D12 (Windows),
Metal (Apple), Vulkan (Linux/Android).

**Browser status (verified July 2026 — production-ready, no longer experimental):**

| Browser | Since | Notes |
|---|---|---|
| Chrome / Edge | 113 (May 2023) | Windows, macOS, ChromeOS; Android since 121; Linux still rolling out (144 beta, Intel Gen12+) |
| Firefox | 141 (July 2025) | Windows; macOS (Apple Silicon) since 145; Linux/Android expected during 2026 |
| Safari | 26 (Sept 2025) | macOS Tahoe, iOS 26, iPadOS 26, visionOS 26; 26.2 added WebXR + WebGPU |

≈ **85% global support** (caniuse, early 2026). The remaining ~15% must get a WebGL 2
fallback, never a blank page.

**What WebGPU uniquely buys us:** GPU compute for particle systems (millions, simulated
on-GPU), fluid/reaction-diffusion sims, GPU-driven culling, and heavy fullscreen
raymarching (fractals, §4E) at full framerate.

### WebGL 2 — the fallback tier

~98%+ support, GLSL ES 3.0, mature and fast for classic raster + fragment-shader work.
No compute shaders (transform feedback is the workaround). Everything we build must
degrade to this tier — ideally automatically (next section).

### Three.js `WebGPURenderer` + TSL — the recommended abstraction

- `WebGPURenderer` is **production-ready since r171**; use the latest release
  (r184+, March 2026, fixed major per-frame allocation overhead). Import from
  `three/webgpu`.
- **TSL (Three Shader Language)** — node-based shader language written in JS/TS that
  **compiles to WGSL on WebGPU and GLSL on WebGL 2**. Write every material, effect, and
  compute pass once; the renderer **falls back to WebGL 2 automatically** when WebGPU
  is unavailable. This single feature is why Three.js (not raw WebGPU, not Babylon) is
  the backbone.
- Post-processing runs through the same node system (`three/tsl` + `PostProcessing`),
  so bloom/DoF/grain/custom passes are also dual-backend.

### Raw WGSL — escape hatch

For pure fullscreen-shader pieces (e.g. a raymarched fractal page) a hand-rolled WGSL
compute/fragment pipeline is legitimate and maximally fast — but each such piece needs
its own WebGL/GLSL or static-asset fallback, so prefer TSL unless the piece demands it.

---

## 3. Site architecture — content ⇄ theme decoupling

**Decision (July 2026):** the advanced-art experience is one **theme**, not the site.
Content (the data) is fully decoupled from presentation; every visual world implements
the same theme contract. This gives us device-appropriate auto-selection, a visitor-facing
switcher, and cheap addition of entirely new worlds later.

### 3.1 Content layer (the data)

`src/content/` — typed, theme-agnostic data. No JSX, no styling, no theme knowledge.

- `SiteContent` = `{ profile, projects[], about, links, meta }`.
- `Project` = `{ id, slug, title, year, summary, body, media[], links[], tags[], art }`.
- **`art` — per-project visual identity ("art DNA"), not presentation:** a set of
  *facets* that themes may interpret. Universal facets any theme can use: `{ seed,
  palette, accent }`. Medium-specific facets are optional — today one fractal facet
  (`fractal: { type: 'mandelbulb' | 'mandelbox' | …, params }`, kept 1:1 with a
  Mandelbulber `.fract` parameter file in `assets/fractals/`). A theme reads the facets
  it cares about and ignores the rest: raymarch the fractal live, show its offline
  render, drive a completely non-fractal generative system from `seed` + `palette`, or
  — in a plain minimal theme — use nothing but `accent`. **Identity is an offer to
  themes, never an obligation**, so content stays decoupled even from the *kind* of
  art. This is what lets artistic themes incorporate the data *fully* without the data
  knowing about them.
- **Routes/sections carry art facets too** (`palette`, `mood`), not only projects. This
  is what makes `singularity`'s bulb re-color and change vibe as the visitor dives into
  different content — driven by data, never by theme-side hardcoding.

### 3.2 Theme contract

A theme owns 100% of presentation — layout, navigation, motion, graphics. It is **not a
skin over shared chrome**: it receives the whole content model and builds its own world.

```ts
interface ThemeDescriptor {
  id: string;                       // 'singularity', 'atlas', …
  name: string;                     // label in the switcher
  requirements: Requirements;       // { webgpu?, webgl2?, minDeviceMemoryGB?, finePointer?, motionOK? }
  weight: number;                   // preference among qualifying themes (higher wins)
  load: () => Promise<ThemeModule>; // dynamic import → each theme is its own code-split chunk
}
interface ThemeModule {
  Root: React.ComponentType<{ content: SiteContent; route: Route }>;
}
```

- Themes may share *logic* (content hooks, router, asset helpers) but never visual
  components — sharing chrome is how decoupling erodes.
- **Routes are content, not theme:** `/`, `/work/:slug`, `/about` are defined once and
  stable across themes. A shared micro-router resolves the route; the theme decides what
  navigation *feels* like (camera flight through a fractal vs. a page turn). URLs stay
  shareable no matter which theme the visitor lands in.

### 3.3 Registry, resolution, switching

`src/themes/registry.ts` lists all descriptors. A tiny theme-independent boot shell
(target < ~50 KB; also owns the theme-switcher overlay and a11y basics) resolves in order:

1. `?theme=` URL param — deep-link/demo override
2. persisted visitor choice (`localStorage`)
3. capability probe: `navigator.gpu.requestAdapter()`, WebGL 2 context test,
   `navigator.deviceMemory`, `prefers-reduced-motion`, `saveData`, pointer/viewport
   media queries
4. → highest-`weight` theme whose `requirements` all pass. The static theme declares no
   requirements, so resolution can never come up empty.

Switching = unmount the current theme root, dynamic-import the next. Content and current
route survive the swap untouched — the decoupling made visible.

### 3.4 Theme roster (concepts locked July 2026)

| Theme | Concept (Damyan's brief) | Tech | Requires / weight |
|---|---|---|---|
| **`singularity`** — 3D fractal dive | The world as a **Mandelbulb that represents time, with the projects embedded within it**. Navigation = **diving inside the bulb**: traveling through it reaches the subpages, and the bulb's colors & vibe adapt to the currently displayed content (route-level art facets, §3.1). Raymarched live from art DNA; compute particles. | R3F + WebGPURenderer/TSL (iquilez DE playbook, §4F), Motion, Lenis | WebGPU; degrades internally to WebGL 2 (§6). Highest weight |
| **`atlas`** — 17th-century map of discovery | **The résumé is the map.** Blaeu/Ortelius-era engraving language over the tectonic-map reference (§4D): the visitor *explores* the CV as territory — education, experience, plans, proficiencies as regions, routes, and legends — with the rest of the site as further charts. Pan/zoom exploration, engraved period type. | SVG + d3-zoom (OpenSeadragon if tiled raster scans), Motion, IM Fell fonts | none (GPU-free); mid weight |
| **`blueprint`** — modern industrial | **Industrial vibe that feels like engineering**, animation-heavy, with a fun twist from gaming/game-dev (the name puns on engineering drawings *and* Unreal's Blueprint). teenage.engineering register (§4F): spec grids with 1px gaps, safety-orange on black, monospace, exposed structure. | HTML/CSS + Motion (optionally Rive for machine-like vector animation) | none; mid weight, prefers `motionOK` |
| **`julia`** — 2D fractal | **2D fractals arranged tastefully** — offline renders plus trivially cheap real-time Julia/Mandelbrot shaders — with **cool fractal-tied effects on all text and buttons** (SVG filters / CSS masks driven by the same palette facets). | HTML/CSS + Motion, AVIF stills, optional tiny WebGL 2 shader | none — **universal floor**, reduced-motion-friendly |

Same identity everywhere: `singularity` raymarches a project's fractal facet live;
`julia` and `atlas` reuse its offline render or palette. Different worlds, one DNA.
A future theme is one new descriptor + module, content untouched — it need not be
fractal-based (blueprint isn't). Suggested default weights: singularity 100 › blueprint
60 › atlas 50 › julia 10 (floor) — tune freely; low-weight themes are reached through
the switcher rather than auto-resolution.

### 3.5 Site map & content inventory (July 2026)

Routes (stable across themes, §3.2): `/` · `/cv` · `/projects` · `/projects/:slug` · `/interests`

- **`/` landing** — clearly separated gateways to every subpage; GitHub profile picture
  (`https://github.com/DamianLHr.png`); links to GitHub and all socials.
- **`/cv`** — Education (BSc Computer Science & Engineering at TU/e, year 2, class of
  2027; secondary: National Gymnasium of Natural Sciences and Mathematics "Acad. L.
  Chakalov", Sofia — Mathematics & Informatics with German); Experience (INDEAVR
  internship, Sofia 2022; 1 year on *Totem*, unreleased game); Plans (MSc in Delft —
  computer graphics, game/engine/tooling development); Proficiencies (spoken +
  programming languages, each cross-linked to the projects that prove it). In `atlas`,
  this page *is* the explorable map.
- **`/projects`** — index + one subpage per project; every project carries
  `{ year, role, duration, tools/platform, category, team?, links, art }`:
  - *Personal:* Extensible Terrain Generation (coming soon)
  - *Game jams (team "Kartof"):* [Don't Break Glass](https://damianhr.itch.io/dont-break-glass)
    (GMTK 2025) · [Kill Bunny](https://damianhr.itch.io/kill-bunny) (Totem Game Jam 2026) ·
    GMTK 2026 entry (very soon)
  - *University (each a ~2-month course project):* Digital Twinning Suspension, a.k.a.
    Twinning Project 2 (2026; presentation + sim video;
    [repo](https://github.com/DamianLHr/Digital-Twinning-Suspension)) · Blood of Hedon
    (2025; downloadable executable) · Olympian Onslaught (2025; Java;
    [repo](https://github.com/DamianLHr/Olympian-Onslaught); downloadable executable)
- **`/interests`** (one subpage) — Books (favourite series) · Gaming (favourites + Steam
  link) · Skiing (background) · Music (Spotify link).

Bodies are markdown strings rendered by each theme's own renderer — **no MDX**, so
content never imports theme components (§3.2 guardrail). Heavy deliverables
(executables, long videos) are *linked*, not bundled — see §5 asset pipeline.

**Draft copy for all pages is maintained in [`CONTENT.md`](CONTENT.md)** (same folder) —
the working "data" file that becomes typed `src/content/` modules at scaffold time; its
`TODO` markers are the open content questions for Damyan.

---

## 4. Reference library (categorized)

The 8 supplied references, what each is, and how we draw from it.

### A. Animation & motion

**Motion — https://motion.dev/** *(library — install and use)*
Successor to Framer Motion. React, vanilla JS, and Vue APIs. Key features: real spring
physics, hardware-accelerated scroll-linked animation (ScrollTimeline), layout
animations (`layout` prop), gestures (hover/press/drag), exit animations
(`AnimatePresence`), orchestration (variants/stagger/timelines), `useMotionValue` for
real-time derived motion. Free/open-source core; Motion+ is an optional paid tier.
**Use for:** all DOM/UI animation — page transitions, scroll choreography, menu/text
reveals — and as the bridge between scroll/pointer state and Three.js uniforms via
motion values.

### B. Data visualization

**Bklit UI — https://bklit.com/** *(component library + visual reference)*
Design-focused chart components: 17+ chart types (area, bar, candlestick, pie, scatter,
sankey…) plus legends, tooltips, axes, brushes, and a no-code "Studio" builder. An
alternative to Recharts/Tremor with much higher visual polish.
**Use for:** the visual language of any data-driven section (project metrics, "by the
numbers" panels); pull in its React components directly if a section calls for charts.

### C. AI design skills (install these when building)

These are agent skill files that raise the design quality of AI-assisted frontend work.
Install all three at build time and apply them during layout/styling/motion passes.

**Emil Kowalski's design-engineering skill — https://emilkowal.ski/skill**
`npx skills add emilkowalski/skill` → `emil-design-eng`. By the design engineer behind
Sonner and Vaul and the animations.dev course. Focused on animation/motion taste:
when to animate, easing/spring choices, motion vocabulary for prompting. Includes a
`review-animations` command to critique implemented motion.
**Use for:** reviewing every interactive/animated piece after building it.

**Taste Skill — https://www.tasteskill.dev/**
`npx skills add Leonxlnx/taste-skill`. "The Anti-Slop Frontend Framework for AI Agents"
(Leon Lin & blueemi). 13+ SKILL.md files: redesign workflows, specific visual styles
(minimalist, brutalist…), image-to-code, design-system mapping, dark-mode protocol,
pre-flight checks before shipping.
**Use for:** guarding against generic AI-default design during every styling pass.

**UI UX Pro Max — https://uupm.cc/**
Searchable design-intelligence database as a Claude Code skill: 57 UI styles
(glassmorphism, brutalism…), 95 industry color palettes, 56 font pairings (Google
Fonts), 24 chart-type recommendations, 29 landing-page patterns, UX guidelines
(animation, a11y, performance). Open source.
**Use for:** art-direction exploration — style/palette/type-pairing decisions when
defining or evolving the site's look.

### D. Inspiration & aesthetic references

**Godly — https://godly.design/sites** *(inspiration gallery)*
Curated library of award-tier web design (sites, sections, OG images, app UI).
**Use for:** the recurring inspiration checkpoint — browse before designing each major
section; benchmark against the best creative/portfolio sites of the moment.

**Tectonic map of Europe — https://orthoslogos.fr/cartographie/carte-tectonique-europe/**
*(aesthetic reference)*
Archival 1962 tectonic map (International Geological Congress / USSR Academy of
Sciences, 1:2,500,000; David Rumsey collection). Not interactive — its value is the
look: geological color-coding language, dense-but-legible layered cartography,
map-as-art.
**Use for:** the seed reference for the `atlas` theme (§3.4) — archival-cartography
color palettes and textures, contour/hatching motifs, and the résumé-as-explorable-map
metaphor. The 17th-century engraving sources that extend it are in §4F.

### E. Asset generation & rendering technique

**Mandelbulber 2 — https://github.com/buddhi1980/mandelbulber2 + https://www.mandelbulber.com/**
*(desktop tool + technique playbook)*
Open-source (GPL-3, C++/Qt) 3D fractal renderer: trigonometric/hypercomplex/Mandelbox/
IFS fractals, raymarching with hard shadows, ambient occlusion, DoF, translucency &
refraction, Monte Carlo photorealism, OpenCL multi-GPU, keyframe animation, unlimited
resolution, CLI/batch/network rendering.
**Use two ways:**
1. **Offline asset generation** — hero images and looping background videos rendered at
   quality no real-time shader can match; compress to AV1/WebM + AVIF posters and ship
   as video textures or plain media.
2. **Technique reference** — its raymarching playbook (distance estimators for
   Mandelbulb power-8 / Mandelbox, DE-based AO and soft shadows) is exactly what we
   re-implement as **real-time TSL/WGSL fullscreen shaders** for live, interactive 3D
   fractals in the browser. WebGPU compute makes browser-side fractal raymarching at
   high res realistic; WebGL 2 tier drops resolution/steps.

Per-project `.fract` parameter files double as the fractal facet of the content-side
art DNA (§3.1) — one source of truth feeding both uses across all fractal themes.

### F. Look references (researched on the net, 2026-07-07)

Per-theme visual research, as requested in the brief:

**`atlas` — 17th-century map of discovery**
- [Blaeu Atlas Maior (1662–65) — complete high-res scans, National Library of Scotland](https://maps.nls.uk/atlas/blaeu-maior/info.html)
  — the Golden Age Dutch atlas, the most expensive book of its century; *the* source for
  engraving style, hand-coloring, cartouches, and period typography.
- [David Rumsey Historical Map Collection](https://www.davidrumsey.com/) — 147,000+
  scanned maps with deep zoom (also hosts the tectonic map, §4D).
- [Ortelius, *Theatrum Orbis Terrarum* (1570)](https://www.geographicus.com/P/AntiqueMap/tartary-ortelius-1570)
  — the first modern atlas; border art, sea monsters, decorative lettering.

**`singularity` — real-time Mandelbulb dive**
- [Inigo Quilez — Mandelbulb article](https://iquilezles.org/articles/mandelbulb/) — the
  canonical distance-estimator derivation and shading approach; runs real-time on modern
  GPUs. This is the implementation bible for the dive.
- [Syntopia — *Distance Estimated 3D Fractals* series](http://blog.hvidtfeldts.net/index.php/2011/08/distance-estimated-3d-fractals-iii-folding-space/)
  — the definitive multi-part DE tutorial (the math heritage Mandelbulber itself builds on).
- [Shadertoy — e.g. "Yet Another Mandelbulb"](https://www.shadertoy.com/view/4dfyDs) —
  live GLSL implementations to study and port to TSL.

**`blueprint` — industrial / engineering**
- [teenage.engineering](https://teenage.engineering/designs) — the masterclass: exposed
  engineering, monospace type, spec tables with 1px gaps, safety-orange on black,
  products as explorable 3D objects.
- [Retro & brutalist UI field guide (2026)](https://www.setproduct.com/blog/retro-brutalist-ui-design-2026)
  and [Webflow's brutalism gallery](https://webflow.com/made-in-webflow/brutalism) —
  pattern catalogs for the industrial/brutalist register.

**`julia` — 2D fractal art** — generated in-house (offline renders or tiny shaders,
§3.4); use godly.design (§4D) for layout taste around the art.

---

## 5. Recommended stack

Chosen for "most advanced, most graphically impressive (WebGPU), most modern":

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast, standard, first-class static output for Pages |
| UI framework | **React 19** | Best ecosystem fit for Motion + react-three-fiber |
| 3D | **Three.js (latest, `three/webgpu`) via react-three-fiber v9 + drei** | Declarative scenes; R3F v9 supports `WebGPURenderer` through an async `gl` factory (`gl={async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }}`) |
| Shaders | **TSL** (primary), raw WGSL escape hatch | One codebase → WGSL + GLSL fallback |
| Post-processing | Three's TSL node `PostProcessing` | Dual-backend bloom/DoF/grain |
| UI animation | **Motion (React API)** | Springs, scroll, layout, exits |
| Smooth scroll | **Lenis** | Standard for award-tier scroll feel; syncs with R3F frame loop |
| Charts (if needed) | **Bklit UI** | See §4B |
| Deploy | **GitHub Actions → GitHub Pages** | `actions/upload-pages-artifact` + `actions/deploy-pages` on push to `main` |
| App architecture | **Content ⇄ theme decoupling (§3)** | Boot shell resolves theme; each theme is its own code-split dynamic import |
| Map exploration (`atlas`) | **SVG + d3-zoom** (OpenSeadragon if tiled raster scans) | Buttery pan/zoom over the résumé-map; deep zoom for the archival-scan feel |
| Fonts | **@fontsource** (self-hosted) | `IM Fell` family for `atlas` — genuine 17th-century types on Google Fonts; grotesk + mono for `blueprint`; zero external font requests |
| Rich text | Markdown bodies + per-theme renderer (**react-markdown**) | Content stays JSX-free (§3.5) |
| Images | **vite-imagetools** | Build-time responsive AVIF/WebP sets |
| Big deliverables | **GitHub Releases + itch.io embeds** | Executables & long videos hosted on the project repos' Releases; jam games embedded (or playable, if web builds) via itch.io |

**Asset pipeline:** KTX2/Basis compressed textures; Draco or meshopt-compressed glTF;
AVIF/WebP images; AV1/VP9 WebM for Mandelbulber video loops (H.264 MP4 fallback);
preload only above-the-fold, lazy-load scenes below. Executables (Blood of Hedon,
Olympic Onslaught) and long videos live on the project repos' **GitHub Releases**, never
in this repo; presentations ship as PDF download + pre-rendered slide images.
**SPA deep links on Pages:** copy `index.html` → `404.html` at build so
`/projects/kill-bunny` survives refresh and direct linking.

---

## 6. Theme selection, fallback & performance policy

Never white-screen. Degradation happens at two levels:

**Across themes (device-appropriate world, §3.3):** the boot shell auto-picks the
richest theme the device qualifies for; `julia` declares no requirements and is the
universal floor (honors `prefers-reduced-motion`, works on anything). Visitors can
always switch manually, and their choice persists.

**Within `singularity`:**

1. **WebGPU** (~85% of visitors): full experience — compute-driven particles,
   full-res raymarched fractals, heavy post.
2. **WebGL 2** (same TSL code, automatic via Three.js): compute-dependent effects swap
   to cheaper variants (fewer CPU/texture-sim particles, half-res raymarching with
   fewer steps, trimmed post-chain).
3. Neither available, or WebGL context loss at runtime → the shell kicks the visitor
   down to `julia`, same route preserved.

**Budgets & practices:** target 60 fps desktop / stable 30+ fps mobile; adaptive DPR
(cap ~1.5–2, scale down under load); lazy-mount heavy canvases via IntersectionObserver
and pause off-screen loops; code-split per theme and per section; single shared
`<Canvas>` where possible (context count limits); test on a real mid-range phone, not
just desktop.

---

## 7. Workflow notes

- The AI design skills (§4C) are **installed** (2026-07-07) in this project's
  `.claude/skills/` — core set of 10: `emil-design-eng`, `review-animations`,
  `animation-vocabulary` (Emil Kowalski); `taste-skill` + `brutalist-skill` +
  `minimalist-skill` + `redesign-skill` (Taste Skill); `ui-ux-pro-max`, `design`,
  `ui-styling` (UI UX Pro Max). Apply them during styling/motion passes; run
  `review-animations` after each interactive piece. The remaining skills from those
  repos can be added later the same way (clone → copy folder).
- Check godly.design before designing each major section.
- Mandelbulber renders happen offline on Damyan's machine; keep source `.fract`
  parameter files in the repo (tiny — they are the per-project art DNA, §3.1), keep
  rendered media out of git history where possible (or compressed hard) to respect
  Pages limits.
- New content must never require theme changes, and a new theme must never require
  content changes — if either happens, the contract (§3.2) is being violated; fix the
  contract, not the caller.
- Verify WebGPU *and* forced-WebGL2 paths *and* every registered theme (at minimum the
  `julia` floor) in a real browser before every deploy (Chrome flag
  `--disable-features=WebGPU` or `forceWebGL: true` in Three.js; `?theme=<id>`).

---

## 8. Sources

- Reference links (researched 2026-07-06): [Motion](https://motion.dev/) ·
  [Bklit](https://bklit.com/) · [Emil Kowalski skill](https://emilkowal.ski/skill) ·
  [Taste Skill](https://www.tasteskill.dev/) · [UI UX Pro Max](https://uupm.cc/) ·
  [Godly](https://godly.design/sites) ·
  [Tectonic map of Europe](https://orthoslogos.fr/cartographie/carte-tectonique-europe/) ·
  [Mandelbulber 2 (GitHub)](https://github.com/buddhi1980/mandelbulber2) /
  [mandelbulber.com](https://www.mandelbulber.com/)
- WebGPU status: [caniuse.com/webgpu](https://caniuse.com/webgpu) ·
  [web.dev — WebGPU supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers) ·
  [gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- Three.js: [WebGPURenderer docs](https://threejs.org/docs/pages/WebGPURenderer.html) ·
  [TSL docs](https://threejs.org/docs/pages/TSL.html) ·
  [releases](https://github.com/mrdoob/three.js/releases)
- Look references (researched 2026-07-07): see §4F for the per-theme list
  (Blaeu/NLS, David Rumsey, Ortelius, iquilezles.org, Syntopia, Shadertoy,
  teenage.engineering, brutalist-UI guides).
