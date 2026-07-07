// Theme-agnostic content model — the "data" side of the content ⇄ theme decoupling
// (TECHNOLOGY.md §3.1). Content files may import ONLY from src/content/.

/** Per-project / per-route visual identity ("art DNA"). Facets are an offer to
 * themes, never an obligation: a theme reads what it understands, ignores the rest. */
export interface ArtDNA {
  seed?: number
  palette?: string[]
  accent?: string
  fractal?: {
    type: 'mandelbulb' | 'mandelbox' | 'julia' | 'mandelbrot'
    params?: Record<string, number>
    /** 1:1 Mandelbulber parameter file in assets/fractals/ */
    fractFile?: string
  }
}

export interface LinkRef {
  label: string
  url: string
}

export interface Profile {
  name: string
  tagline: string
  url: string
  pfpUrl: string
  socials: LinkRef[]
}

export interface EducationEntry {
  school: string
  program: string
  location: string
  start: string
  end: string
  details: string[]
}

export interface ExperienceEntry {
  company: string
  role: string
  start: string
  end: string
  teamSize?: number
  tools: string[]
  summary: string
  highlights: string[]
  links: LinkRef[]
}

export interface SpokenLanguage {
  language: string
  level: string
}

export interface ProgrammingProficiency {
  name: string
  evidence: string
  /** Slugs of projects that prove it — validated against the project roster. */
  projectSlugs: string[]
}

export interface Proficiencies {
  spoken: SpokenLanguage[]
  programming: ProgrammingProficiency[]
  expanding: ProgrammingProficiency[]
}

export interface CV {
  education: EducationEntry[]
  experience: ExperienceEntry[]
  plans: string
  proficiencies: Proficiencies
}

export type ProjectCategory = 'personal' | 'jam' | 'university'

export interface Project {
  slug: string
  title: string
  category: ProjectCategory
  status: 'released' | 'coming-soon'
  year?: number
  /** Jam or course the project belongs to. */
  event?: string
  duration?: string
  role?: string
  team?: { name?: string; size?: number; members?: string[] }
  tools: string[]
  summary: string
  /** Markdown body for the project subpage (rendered by each theme's own renderer). */
  body?: string
  links: LinkRef[]
  /** itch.io HTML5 embed for browser-playable builds. */
  playableEmbedUrl?: string
  art?: ArtDNA
}

export interface InterestSection {
  id: string
  title: string
  body: string
  links: LinkRef[]
}

/** Route-level art facets: lets themes (e.g. singularity's bulb) re-color per page. */
export interface RouteArt {
  home?: ArtDNA
  cv?: ArtDNA
  projects?: ArtDNA
  interests?: ArtDNA
}

export interface SiteContent {
  profile: Profile
  cv: CV
  projects: Project[]
  interests: InterestSection[]
  routeArt: RouteArt
}
