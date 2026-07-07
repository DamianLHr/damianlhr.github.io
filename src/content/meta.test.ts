import { describe, expect, it } from 'vitest'
import { SITE } from './meta'

describe('site meta', () => {
  it('has non-empty identity fields', () => {
    expect(SITE.name.length).toBeGreaterThan(0)
    expect(SITE.tagline.length).toBeGreaterThan(0)
    expect(SITE.url).toMatch(/^https:\/\//)
  })
})
