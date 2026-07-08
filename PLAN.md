# PLAN.md — Build plan & quality contract

> How the site gets built, in what order, and the three assurance systems behind it:
> **works perfectly** (verification machine), **Damyan likes it** (taste gates),
> **stays extensible** (contract enforced in code). Companion to TECHNOLOGY.md (how)
> and CONTENT.md (what). Status markers: `[ ]` todo · `[x]` done · `[~]` in progress.

---

## 0. Working agreement (applies to every phase)

- **Gates:** each phase ends in a named gate. A gate = Damyan explicitly approves
  (picks an option or says "ship it"). Nothing is built *on top of* an unapproved gate.
- **Options, not surprises:** every subjective fork (art direction, palette, type,
  motion feel) is presented as **2–3 concrete visual options** — screenshots or live
  deployed URLs — never described in prose only. If all options miss, we re-tile;
  we never polish a miss.
- **Always deployable:** `main` always builds and deploys. Every theme ships to the
  live site behind `?theme=<id>` *before* it auto-wins resolution, so Damyan reviews
  each theme on his real laptop + phone, at his leisure.
- **Self-review before user-review:** before anything is shown, Claude runs it in the
  live preview (dev server + screenshots + console + mobile viewport) and runs the
  installed design skills (`taste-skill` pre-flight, `review-animations` for motion).
  Damyan never sees console errors or obvious jank.
- **Content edits are Damyan's anytime:** CONTENT.md stays the source of truth; he can
  edit it whenever, Claude transcribes into typed content on the next pass.

---

## 1. Phases & gates

### Phase 0 — Skeleton on the wire *(foundation, ~1 session)*
- [x] `npm create vite@latest` — Vite 8 + React 19.2 + TypeScript 6 (strict) — 2026-07-07
- [x] Tooling rails: **oxlint** (2026 template default, replaces ESLint; §3 boundary
      rules will be a custom check script in Phase 1), Prettier, Vitest, `.nvmrc`
- [x] Dependencies: `three` (latest, `three/webgpu`), `@react-three/fiber@9`, `drei`,
      `motion`, `lenis`, `react-markdown`, `vite-imagetools`
- [x] `git init` + first commit `74eafaa` (amended: **no Claude attribution in commits,
      ever — Damyan's standing order**); repo created by Damyan and pushed
      (origin = github.com/DamianLHr/damianlhr.github.io) — 2026-07-07
- [x] GitHub Actions: lint → test → build (typecheck inside) → deploy to Pages;
      `404.html` SPA fallback in postbuild — *verified locally: build green, tests
      green, page + 404.html served correctly via `vite preview`*
- [x] **GATE 0 — "it's live": PASSED 2026-07-07.** `https://damianlhr.github.io/`
  serves the built app from the Actions pipeline (`/assets/index-*.js` confirmed);
  deep links serve the app via `404.html` fallback (HTTP 404 status is expected on
  Pages — the app boots and will route client-side). Pages source = GitHub Actions
  (Damyan flipped it; legacy branch build no longer races deploys).

### Phase 1 — The spine *(architecture kernel, ~1–2 sessions)*
- [x] Types: `SiteContent`, `Project`, `ArtDNA` (faceted), `Route` — content-integrity
      tests fail CI on bad/missing content (src/content/content.test.ts)
- [x] CONTENT.md transcribed → `src/content/{meta,cv,projects,interests}.ts` (typed)
- [x] Theme contract (`shared/theme-contract.ts`) + registry + pure resolver
      (?theme= → localStorage → capability probe → weight) + boot shell with
      switcher overlay (skill-guided: 150ms strong ease-out, origin-aware menu,
      :active scale, reduced-motion honored) + history micro-router.
      Error boundary kicks a crashed theme down to the floor. Main bundle 66 KB gz;
      each theme is its own ~1 KB chunk.
- [x] `hold` theme (public placeholder, weight 10) + **`debug` theme** (weight −1,
      unlisted in prod but reachable via `?theme=debug`) — the content-QA surface
- [x] Unit tests: 26 passing — resolver decision table, route parse/format
      round-trips, content integrity (slug uniqueness, proficiency cross-refs, link
      hygiene). Plus `scripts/check-boundaries.mjs` in CI: content/shared/themes/
      shell import separation is a build failure, not a convention.
- [x] **GATE 1 — PASSED 2026-07-07.** Self-verified (route + content survive theme
      swaps, deep links, mobile, zero console errors). Damyan's one fix request:
      switcher must be visible on the live site → `debug` made publicly listed
      (`cac7614`); he then green-lit Phase 2.

### Phase 2 — `julia` floor theme *(first real face, ~2–3 sessions)*
*Why first: universal floor = site becomes genuinely shippable; cheapest place to
bootstrap the taste loop before heavy 3D investment.*
- [x] Style tiles shipped 2026-07-07; **GATE 2a PASSED: Damyan picked A — "obsidian
      gallery"** (dark, ember accent `#ff5c1a`, Space Grotesk, split layout, fractal-
      palette underline language, real canvas-rendered Julia sets). All three tiles
      archived per his request at `design/style-tiles/` — B "ink etching" is a seed
      candidate for the `atlas` mood, C "spectral dive" for `singularity` moodwork.
- [x] All routes built (c9e68e9, live 2026-07-07): split landing, editorial CV with
      proficiency→project cross-links, grouped projects index with per-project Julia
      thumbnails (art-DNA identity via curated constant pool + slug hash), project
      pages (masked fractal hero, spec grid, action buttons), interests bento with
      fractal washes, fractal 404. Canvas renderer, no GPU. Self-hosted Space
      Grotesk. Accent heated to **#ff6a00** on Damyan's "make the orange pop" note.
- [x] Motion pass (CSS-only per emil rules: transform/opacity, strong ease-out,
      ≤300ms, :active scale, entry stagger ≤160ms, reduced-motion fades; Motion lib
      deliberately unused to keep the floor light)
- [x] Design QA: taste-skill pre-flight applied (em/en dashes stripped from all
      visible copy, eyebrow discipline, one locked accent, AA contrast on buttons);
      preview self-review desktop + mobile, console clean; header fractal strips cut
      (bad aspect for Julia sets), replaced with clean headlines
- [x] Revision round 1 (Damyan: "bigger landing fractal, animated/responsive, all
      fractals respond to traversal, more fun; CV stays subdued") — shipped 2948aa8:
      full-bleed morphing hero (pointer-follow with eased smoothing + ambient drift +
      idle sharpening; low-res morph frames upscaled for 60fps CPU rendering),
      traversal blooms on every fractal, hover morphs + scale on project thumbnails,
      ember interior depth shading, coarse-pointer/battery and reduced-motion paths,
      mobile recomposition. CV untouched.
- [x] Revision round 2 (Damyan: galaxy hero at ~45° TL→BR fading both sides, more
      reactive, fix pixelation, whole-card hover, projects not-a-list, announcements
      in all themes, personal on top): WebGL2 renderer (full-res 60fps; readback-
      verified probe; CPU floor fallback + `?cpufractal` QA override), renderer
      rotation param, hold-click dive, `Announcement` content type + ticker/panel in
      julia/hold/debug, fractal-card mosaic with up-next panel on top. Docs written:
      docs/ADDING-A-THEME.md + docs/ADDING-CONTENT.md. Standing rule recorded: every
      theme must be special, never bland.
- [x] **GATE 2b — PASSED 2026-07-07.** Damyan: "I like the julia theme now." julia is
      the approved floor and default.

### Phase 3 — `singularity` tech spike *(de-risk the flagship, ~1–2 sessions)*
*The dive is the highest-risk tech in the project — prove it before designing around it.*
- [x] Prototype SHIPPED (e375cdc, live at `?theme=spike`): power-8 Mandelbulb
      raymarcher in TSL (WGSL on WebGPU, GLSL via `?webgl`), scroll-to-dive with
      DE-scaled collision-aware speed (CPU mirror of the estimator), drag-look,
      orbit-trap ember shading + AO + rim + fog + halo, route links recolor the bulb
      live. Damyan's spike decisions: scroll-dive, beauty-at-60fps, ember base.
- [x] Art + formula upgrade (2026-07-08, Damyan's direction): fractal switched to
      **BoxFoldBulbPow2** (Mandelbulber foldingIntPow: mandelbox box/sphere folds →
      quadratic bulb; cheaper per iteration than the trig power-8). Set probed at
      radius ≈1.3 with false far-field attractors — estimator answers bounding-
      sphere distance outside r=1.6. Black→fire ramp from route palette (measured
      trap median 3.25 drives heat + radial geode gradient), warm key light with
      soft raymarched shadows, cool fill, heat-gated spec/fresnel (cold obsidian
      stays matte), crevice embers, clamped volumetric glow, distance fog, ACES-ish
      tonemap + vignette. Default pose at the shell mouth (fire mandala). Perf:
      fps-driven adaptive resolution (0.55×–DPR cap; manual HUD buttons override),
      bounding-sphere ray clip. QA params: `?cam=x,y,z` `?yaw=` `?pitch=` `?ff=`
      `?zf=` `?dbg=hit|heat|ao|trap|base|embers|glow|lit`. Dev-preview GPU:
      ~240 fps WebGPU and ~230 fps forced-WebGL2 at 1298×1493, ~90–160 fps deep
      in dense interior views.
- [~] Measure on real hardware — HUD shows fps/backend/resolution/surface-distance
      with DPR buttons. First numbers (dev preview GPU, 1298×1075 WebGPU): ~240 fps
      orbiting, ~228 fps deep in the folds. **Damyan's machine numbers pending
      (WebGPU at each DPR + `?webgl` tier).**
- [ ] Decision memo into TECHNOLOGY.md after Gate 3 numbers: live vs pre-rendered
      per tier; fp32 depth limit noted (~4-6 orders of magnitude of dive).
- [~] **GATE 3 — "the dive is real": awaiting Damyan** — dive it on his machine,
  read the HUD numbers, go/adjust on singularity scope.

### Phase 4 — `singularity` full build *(the flagship, ~3–5 sessions)*
- [ ] Art DNA design: per-project + per-route fractal params/palettes (Mandelbulber
      `.fract` files authored; offline renders queued for reuse by other themes)
- [ ] Style tile equivalent: **motion tile** — 2–3 short dive treatments (camera feel,
      color language, content presentation inside the bulb) → **GATE 4a: pick**
- [ ] Full navigation-as-dive across all routes; content surfaces woven into the scene;
      compute particles; post chain; internal WebGL 2 degradation; context-loss →
      `julia` kick-down
- [ ] Motion + design QA passes (as Phase 2); perf soak (10-min run, no leak, stable
      frame time; heap + draw-call budget in dev overlay)
- **GATE 4b — "flagship approved":** live review on Damyan's hardware; `singularity`
  gets highest weight (auto-wins on WebGPU devices).

### Phase 5 — `atlas` theme *(the discovery map, ~2–4 sessions)*
- [ ] Map design: the CV as one large engraved chart (Blaeu/Ortelius language over the
      tectonic reference); territory layout for education/experience/plans/
      proficiencies; other routes as further charts
- [ ] Style tile: 2–3 map art directions (engraving density, coloring, IM Fell type
      setting) → **GATE 5a: pick**
- [ ] SVG + d3-zoom pan/zoom exploration; markers/legends as navigation; Motion
      micro-interactions; print-quality static fallback
- **GATE 5b — "atlas approved."**

### Phase 6 — `blueprint` theme *(industrial, ~2–3 sessions)*
- [ ] Style tile: 2–3 industrial treatments (teenage.engineering register: spec grids,
      safety-orange/black, monospace; where the gaming twist lives — e.g. konami-style
      easter eggs, achievement toasts) → **GATE 6a: pick**
- [ ] Build; animation-heavy pass; `review-animations`
- **GATE 6b — "blueprint approved."**
*(Phases 5 and 6 can swap order on Damyan's mood.)*

### Phase 7 — Hardening & launch *(~1–2 sessions)*
- [ ] a11y audit (keyboard nav in every theme, contrast, focus, reduced-motion)
- [ ] SEO/social: per-route meta, OG images (generated from each project's art DNA),
      sitemap, favicon/manifest set
- [ ] Perf final: Lighthouse ≥ 90 (perf/a11y/best-practices/SEO) on julia/atlas/
      blueprint; frame-time report for singularity; bundle budget check
- [ ] Cross-browser matrix run (§2); 404 art page; link checker over all content links
- [ ] README for the repo (the site explains itself)
- **GATE 7 — LAUNCH:** auto-resolution enabled for all themes; announce-ready.

---

## 2. "Works perfectly" — the verification machine

| Layer | Tool | Rule |
|---|---|---|
| Types | TS strict | no `any` in `content/` or theme contracts |
| Content | schema validation in build | bad content = red build, never a blank section |
| Logic | Vitest | resolver decision table, router, content integrity |
| E2E | Playwright in CI | every route × every theme: loads, **zero console errors**, theme switch preserves route, deep links survive refresh |
| GPU paths | local (CI runners have no GPU) | Claude preview tools + Damyan's hardware: WebGPU, forced-WebGL2, context-loss kick-down |
| Perf | Lighthouse CI + dev fps overlay | budgets: boot shell <50 KB gz; Lighthouse ≥90 (non-3D themes); 60 fps desktop / 30+ fps mobile in `singularity`; adaptive DPR verified under CPU throttle |
| Pipeline | GitHub Actions | typecheck→lint→test→build→E2E→deploy; `main` never breaks; Pages always serves last good build |
| Resilience | error boundaries per theme root | any theme crash → `julia` with route preserved, never a white screen |

**Browser matrix per gate:** Chrome/Edge (WebGPU), Firefox Windows (WebGPU), forced
WebGL 2, Damyan's phone via live URL, `prefers-reduced-motion` on.

## 3. "Stays extensible" — contract enforced in code

- **ESLint import boundaries** (the §3.2 guardrail as a build error, not a convention):
  `content/` may import nothing app-side; `themes/X` may import only `content/`,
  `shared/`, and itself — never another theme; only the shell imports the registry.
- **Adding a theme = checklist** (kept in TECHNOLOGY.md): copy `themes/_template/`,
  implement `Root`, add one descriptor to the registry. The `debug` theme and the E2E
  suite automatically cover it (route × theme matrix picks it up with zero new wiring).
- **Adding a project = data only:** one typed object + assets; schema validation and
  the content-integrity tests catch mistakes; every theme renders it with no code
  change.
- **Art DNA is forward-compatible:** facets are optional by type; themes ignore facets
  they don't understand.

## 4. "You like it" — the taste system (summary)

1. **Style tile → pick → build** at every theme (Gates 2a/4a/5a/6a): nothing subjective
   is locked without Damyan choosing among rendered options.
2. **Live `?theme=` URLs** on every deploy: review on real devices, any time.
3. **Installed reviewers before human review:** `taste-skill` pre-flight,
   `review-animations`, `ui-ux-pro-max` palette/type checks, plus Claude's own
   preview screenshots at 3 viewport sizes — jank never reaches Damyan.
4. **Reference-anchored:** each theme's style tiles cite §4F look references
   (godly.design checkpoint before each major section).
5. **Revision rounds are part of each phase**, and a missed direction triggers
   re-tiling, not polishing.

## 5. What Claude needs from Damyan

- **At Gate 0 (one-time):** GitHub auth for repo creation/push (or create the empty
  `damianlhr.github.io` repo manually).
- **At gates:** picks + sign-offs (usually minutes, via options with previews).
- **Whenever:** the open CONTENT.md TODOs (LinkedIn URL, interests favourites, skiing
  story) — they block nothing until Phase 2 content polish; Blood-of-Hedon → public
  before launch.
- **For `singularity`/`julia`/`atlas` assets:** Mandelbulber installed for offline
  renders when art DNA gets authored (Phase 4; Claude prepares `.fract` params).
