import { describe, expect, it } from 'vitest'
import type { Capabilities } from './capabilities'
import type { ThemeDescriptor } from './theme-contract'
import { meetsRequirements, resolveTheme } from './resolver'

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  webgpu: false,
  webgl2: true,
  reducedMotion: false,
  saveData: false,
  deviceMemoryGB: 8,
  finePointer: true,
  ...over,
})

const theme = (id: string, weight: number, requirements = {}): ThemeDescriptor => ({
  id,
  name: id,
  description: id,
  requirements,
  weight,
  listed: true,
  load: () => Promise.reject(new Error('not loaded in tests')),
})

const singularity = theme('singularity', 100, { webgpu: true })
const blueprint = theme('blueprint', 60, { motionOK: true })
const atlas = theme('atlas', 50)
const julia = theme('julia', 10)
const registry = [singularity, blueprint, atlas, julia]

describe('meetsRequirements', () => {
  it('checks webgpu', () => {
    expect(meetsRequirements({ webgpu: true }, caps())).toBe(false)
    expect(meetsRequirements({ webgpu: true }, caps({ webgpu: true }))).toBe(true)
  })

  it('motionOK fails on reduced motion or save-data', () => {
    expect(meetsRequirements({ motionOK: true }, caps({ reducedMotion: true }))).toBe(false)
    expect(meetsRequirements({ motionOK: true }, caps({ saveData: true }))).toBe(false)
    expect(meetsRequirements({ motionOK: true }, caps())).toBe(true)
  })

  it('memory floor only applies when device reports memory', () => {
    expect(meetsRequirements({ minDeviceMemoryGB: 4 }, caps({ deviceMemoryGB: 2 }))).toBe(false)
    expect(meetsRequirements({ minDeviceMemoryGB: 4 }, caps({ deviceMemoryGB: null }))).toBe(true)
  })
})

describe('resolveTheme', () => {
  it('picks highest-weight qualifying theme from the probe', () => {
    expect(resolveTheme({ descriptors: registry, caps: caps() }).id).toBe('blueprint')
    expect(resolveTheme({ descriptors: registry, caps: caps({ webgpu: true }) }).id).toBe(
      'singularity',
    )
  })

  it('falls to the floor when little qualifies', () => {
    const weak = caps({ reducedMotion: true })
    expect(resolveTheme({ descriptors: registry, caps: weak }).id).toBe('atlas')
  })

  it('honors the URL override unconditionally', () => {
    const picked = resolveTheme({
      descriptors: registry,
      caps: caps(), // no webgpu
      urlThemeId: 'singularity',
    })
    expect(picked.id).toBe('singularity')
  })

  it('ignores unknown URL override', () => {
    expect(resolveTheme({ descriptors: registry, caps: caps(), urlThemeId: 'nope' }).id).toBe(
      'blueprint',
    )
  })

  it('honors stored choice while its requirements pass', () => {
    expect(resolveTheme({ descriptors: registry, caps: caps(), storedThemeId: 'julia' }).id).toBe(
      'julia',
    )
  })

  it('drops stored choice when requirements fail', () => {
    const picked = resolveTheme({
      descriptors: registry,
      caps: caps(), // no webgpu
      storedThemeId: 'singularity',
    })
    expect(picked.id).toBe('blueprint')
  })

  it('URL override beats stored choice', () => {
    const picked = resolveTheme({
      descriptors: registry,
      caps: caps(),
      urlThemeId: 'julia',
      storedThemeId: 'atlas',
    })
    expect(picked.id).toBe('julia')
  })

  it('never returns nothing while a requirements-free theme exists', () => {
    const hostile = caps({
      webgpu: false,
      webgl2: false,
      reducedMotion: true,
      saveData: true,
      finePointer: false,
      deviceMemoryGB: 1,
    })
    expect(resolveTheme({ descriptors: registry, caps: hostile }).id).toBe('atlas')
  })
})
