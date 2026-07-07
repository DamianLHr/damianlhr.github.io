import { useEffect, useRef, useState } from 'react'
import type { ThemeDescriptor } from '../shared/theme-contract'

interface Props {
  themes: ThemeDescriptor[]
  activeId: string
  onPick: (id: string) => void
}

// Theme switcher overlay — the one piece of UI the shell owns in every world.
// Design per emil-design-eng: frequently seen ⇒ minimal motion (menu 150ms strong
// ease-out from scale .97 + opacity, origin at the trigger corner), :active scale
// feedback, hover gated to fine pointers, reduced-motion honored in CSS.

export function Switcher({ themes, activeId, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listed = themes.filter((t) => t.listed)
  const active = themes.find((t) => t.id === activeId)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (listed.length < 2) return null

  return (
    <div className="switcher" ref={rootRef}>
      {open && (
        <ul className="switcher-menu" role="menu" aria-label="Themes">
          {listed.map((t) => (
            <li key={t.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={t.id === activeId}
                onClick={() => {
                  setOpen(false)
                  onPick(t.id)
                }}
              >
                <span className="switcher-name">{t.name}</span>
                <span className="switcher-desc">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        ref={buttonRef}
        className="switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        theme · {active?.name ?? activeId}
      </button>
    </div>
  )
}
