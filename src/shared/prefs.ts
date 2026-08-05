// Bumping the suffix retires every persisted choice and sends returning visitors
// back through capability/weight resolution. Bumped to v2 on 2026-08-05 when
// singularity was parked, so devices that had picked it land on the floor again.
const THEME_KEY = 'theme.v2'

export function getStoredThemeId(): string | null {
  try {
    return window.localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

export function setStoredThemeId(id: string): void {
  try {
    window.localStorage.setItem(THEME_KEY, id)
  } catch {
    // storage unavailable (private mode etc.) — choice just won't persist
  }
}
