import { describe, expect, it } from 'vitest'
import { content } from './index'

// Content integrity — bad content fails CI before it can render as a blank section
// (PLAN §2: the verification machine).

describe('content integrity', () => {
  it('has a complete profile', () => {
    expect(content.profile.name.length).toBeGreaterThan(0)
    expect(content.profile.tagline.length).toBeGreaterThan(0)
    expect(content.profile.pfpUrl).toMatch(/^https:\/\//)
    expect(content.profile.socials.length).toBeGreaterThanOrEqual(2)
  })

  it('all links are https and labeled', () => {
    const links = [
      ...content.profile.socials,
      ...content.projects.flatMap((p) => p.links),
      ...content.interests.flatMap((i) => i.links),
      ...content.cv.experience.flatMap((e) => e.links),
    ]
    for (const link of links) {
      expect(link.url, link.label).toMatch(/^https:\/\//)
      expect(link.label.length).toBeGreaterThan(0)
    }
  })

  it('project slugs are unique and URL-safe', () => {
    const slugs = content.projects.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('every project has the required narrative fields', () => {
    for (const p of content.projects) {
      expect(p.title.length, p.slug).toBeGreaterThan(0)
      expect(p.summary.length, p.slug).toBeGreaterThan(20)
      if (p.status === 'released') {
        expect(p.year, p.slug).toBeTypeOf('number')
        expect(p.role, p.slug).toBeDefined()
      }
    }
  })

  it('jam projects name their jam', () => {
    for (const p of content.projects.filter((p) => p.category === 'jam')) {
      expect(p.event, p.slug).toBeDefined()
    }
  })

  it('proficiency project references resolve to real projects', () => {
    const slugs = new Set(content.projects.map((p) => p.slug))
    const proficiencies = [
      ...content.cv.proficiencies.programming,
      ...content.cv.proficiencies.expanding,
    ]
    for (const prof of proficiencies) {
      for (const ref of prof.projectSlugs) {
        expect(slugs.has(ref), `${prof.name} → ${ref}`).toBe(true)
      }
    }
  })

  it('cv has education, experience and plans', () => {
    expect(content.cv.education.length).toBeGreaterThanOrEqual(2)
    expect(content.cv.experience.length).toBeGreaterThanOrEqual(2)
    expect(content.cv.plans.length).toBeGreaterThan(0)
  })

  it('interests cover the four sections', () => {
    expect(content.interests.map((i) => i.id).sort()).toEqual([
      'books',
      'gaming',
      'music',
      'skiing',
    ])
  })
})
