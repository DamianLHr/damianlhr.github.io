const THEME_KEY = 'theme'

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
