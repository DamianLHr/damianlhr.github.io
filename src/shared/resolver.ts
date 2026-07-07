import type { Capabilities } from './capabilities'
import type { Requirements, ThemeDescriptor } from './theme-contract'

// Theme resolution (TECHNOLOGY.md §3.3), pure and unit-tested:
//   1. ?theme= URL param — explicit deep-link/demo override, honored unconditionally
//      (a theme that can't run on the device is expected to degrade internally).
//   2. Persisted visitor choice — honored while its requirements still pass.
//   3. Capability probe → highest-weight qualifying theme.
// A floor theme with empty requirements guarantees resolution never comes up empty.

export function meetsRequirements(req: Requirements, caps: Capabilities): boolean {
  if (req.webgpu && !caps.webgpu) return false
  if (req.webgl2 && !caps.webgl2) return false
  if (req.motionOK && (caps.reducedMotion || caps.saveData)) return false
  if (req.finePointer && !caps.finePointer) return false
  if (
    req.minDeviceMemoryGB !== undefined &&
    caps.deviceMemoryGB !== null &&
    caps.deviceMemoryGB < req.minDeviceMemoryGB
  ) {
    return false
  }
  return true
}

export interface ResolveInput {
  descriptors: ThemeDescriptor[]
  caps: Capabilities
  urlThemeId?: string | null
  storedThemeId?: string | null
}

export function resolveTheme({
  descriptors,
  caps,
  urlThemeId,
  storedThemeId,
}: ResolveInput): ThemeDescriptor {
  if (descriptors.length === 0) throw new Error('theme registry is empty')

  if (urlThemeId) {
    const forced = descriptors.find((d) => d.id === urlThemeId)
    if (forced) return forced
  }

  if (storedThemeId) {
    const stored = descriptors.find((d) => d.id === storedThemeId)
    if (stored && meetsRequirements(stored.requirements, caps)) return stored
  }

  const qualifying = descriptors
    .filter((d) => meetsRequirements(d.requirements, caps))
    .sort((a, b) => b.weight - a.weight)
  if (qualifying.length > 0) return qualifying[0]

  // No theme qualifies (should be impossible with a requirements-free floor):
  // degrade to the lightest-requirements theme rather than white-screening.
  return [...descriptors].sort(
    (a, b) => Object.keys(a.requirements).length - Object.keys(b.requirements).length,
  )[0]
}
