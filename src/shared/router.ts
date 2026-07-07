import { useSyncExternalStore } from 'react'
import { parseRoute, type Route } from './routes'

// Minimal history router. Themes receive `route` + `navigate` and own everything
// about how navigation LOOKS; this module owns only what the URL IS.

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('popstate', notify)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('popstate', notify)
  }
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
  notify()
}

function currentPathname(): string {
  return window.location.pathname
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, currentPathname)
  return parseRoute(pathname)
}
