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
- [ ] `npm create vite@latest` — React 19 + TypeScript (strict), in this folder
- [ ] Tooling rails: ESLint (+ import-boundary rules, see §3), Prettier, Vitest, `.nvmrc`
- [ ] Dependencies: `three` (latest, `three/webgpu`), `@react-three/fiber@9`, `drei`,
      `motion`, `lenis`, `react-markdown`, `vite-imagetools`
- [ ] `git init` + first commit; create GitHub repo `damianlhr.github.io`
      ⚠️ *needs Damyan's GitHub auth once (gh CLI login or he creates the empty repo
      and Claude pushes)*
- [ ] GitHub Actions: typecheck → lint → test → build → deploy to Pages; `404.html`
      SPA fallback baked into the build
- **GATE 0 — "it's live":** `https://damianlhr.github.io/` serves a hello page from CI.
  *Verify: fresh deploy from a clean clone, deep-link refresh works.*

### Phase 1 — The spine *(architecture kernel, ~1–2 sessions)*
- [ ] Types: `SiteContent`, `Project`, `ArtDNA` (faceted), `Route`; content schema
      validation that **fails the build** on bad/missing content
- [ ] Transcribe CONTENT.md → `src/content/*.ts` (typed, markdown bodies as strings)
- [ ] Theme contract: `ThemeDescriptor` / `ThemeModule`; registry; resolver
      (URL param → localStorage → capability probe → weight); boot shell < 50 KB gz
      with switcher overlay + a11y basics; micro-router (stable routes across themes)
- [ ] **`debug` theme** (dev-only, weight −1): plain HTML dump of all content on all
      routes — proves decoupling, doubles as the content-QA surface forever
- [ ] Unit tests: resolver decision table (webgpu/webgl2/reduced-motion/saveData
      combinations), router, content integrity (every project has year/role/links,
      art-DNA references resolve)
- **GATE 1 — "the pattern works":** switch debug-theme instances mid-navigation;
  route + content survive. Damyan skims the debug dump for content correctness.

### Phase 2 — `julia` floor theme *(first real face, ~2–3 sessions)*
*Why first: universal floor = site becomes genuinely shippable; cheapest place to
bootstrap the taste loop before heavy 3D investment.*
- [ ] **Style tiles:** 2–3 static full-page mockups of the landing (fractal placement,
      type, palette, effect language) → **GATE 2a: Damyan picks a direction**
- [ ] Build all 5 routes; fractal assets (offline renders + tiny Julia/Mandelbrot
      shader accents); fractal-tied text/button effects; reduced-motion variants
- [ ] Motion pass (Motion; `review-animations` on every interaction)
- [ ] Design QA (`taste-skill`, `minimalist-skill` pre-flight) + Claude preview
      self-review (desktop/tablet/mobile, dark mode, console clean)
- **GATE 2b — "floor approved":** Damyan reviews live `?theme=julia` on laptop +
  phone; revision round(s) until sign-off. `julia` becomes the auto-resolution floor.

### Phase 3 — `singularity` tech spike *(de-risk the flagship, ~1–2 sessions)*
*The dive is the highest-risk tech in the project — prove it before designing around it.*
- [ ] Prototype: real-time raymarched Mandelbulb (TSL, iquilez DE playbook §4F of
      TECHNOLOGY.md), camera path *into* the bulb, palette re-color from route facets
- [ ] Measure on real hardware: fps at DPR 1/1.5/2 on WebGPU; the same scene on forced
      WebGL 2 (`forceWebGL: true`) with reduced steps/half-res
- [ ] Decision memo written into TECHNOLOGY.md: what runs live vs. what gets
      pre-rendered (Mandelbulber video loops) per tier
- **GATE 3 — "the dive is real":** Damyan sees the prototype dive on his machine;
  go/adjust decision on the singularity concept scope.

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
