import { useCallback, useEffect, useRef, useState } from 'react'

// Traversal for the plate. Hand-rolled rather than d3-zoom (which TECHNOLOGY.md
// originally specced): the behaviour needed here is small and specific — clamp
// to the world, zoom about the pointer, and let a click still reach a city —
// and doing it directly avoids two dependencies for ~100 lines.

export interface View {
  k: number
  x: number
  y: number
}

interface Opts {
  worldW: number
  worldH: number
  viewW: number
  viewH: number
  maxZoom?: number
}

/** Keep the world covering the viewport so paper never shows through mid-pan. */
function clamp(v: View, o: Opts): View {
  const fit = o.viewW / o.worldW
  const k = Math.max(fit, Math.min(o.maxZoom ?? fit * 5, v.k))
  const spanX = o.viewW - o.worldW * k
  const spanY = o.viewH - o.worldH * k
  const x = spanX >= 0 ? spanX / 2 : Math.max(spanX, Math.min(0, v.x))
  const y = spanY >= 0 ? spanY / 2 : Math.max(spanY, Math.min(0, v.y))
  return { k, x, y }
}

export function useMapView(o: Opts) {
  const fit = o.viewW / o.worldW
  const [view, setView] = useState<View>(() => clamp({ k: fit, x: 0, y: 0 }, o))
  const ref = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: number } | null>(null)
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map())
  const [grabbing, setGrabbing] = useState(false)

  /** client px → viewBox units */
  const toLocal = useCallback(
    (cx: number, cy: number) => {
      const el = ref.current
      if (!el) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      return { x: ((cx - r.left) / r.width) * o.viewW, y: ((cy - r.top) / r.height) * o.viewH }
    },
    [o.viewW, o.viewH],
  )

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const p = toLocal(cx, cy)
        const k = v.k * factor
        // hold the point under the cursor fixed in world space
        return clamp({ k, x: p.x - ((p.x - v.x) / v.k) * k, y: p.y - ((p.y - v.y) / v.k) * k }, o)
      })
    },
    [o, toLocal],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY)
    }

    const onDown = (e: PointerEvent) => {
      pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch.current.size === 1) {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }
        setGrabbing(true)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (pinch.current.has(e.pointerId)) {
        pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      if (pinch.current.size === 2) {
        const [a, b] = [...pinch.current.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const prev = (onMove as unknown as { d?: number }).d
        ;(onMove as unknown as { d?: number }).d = d
        if (prev) zoomAt(d / prev, (a.x + b.x) / 2, (a.y + b.y) / 2)
        return
      }
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const el2 = ref.current
      if (!el2) return
      const r = el2.getBoundingClientRect()
      const dx = ((e.clientX - d.x) / r.width) * o.viewW
      const dy = ((e.clientY - d.y) / r.height) * o.viewH
      d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y)
      d.x = e.clientX
      d.y = e.clientY
      setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }, o))
    }

    const onUp = (e: PointerEvent) => {
      pinch.current.delete(e.pointerId)
      if (pinch.current.size < 2) (onMove as unknown as { d?: number }).d = undefined
      if (drag.current?.id === e.pointerId) {
        drag.current = null
        setGrabbing(false)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [o, zoomAt])

  /** True when the pointer travelled far enough that this was a pan, not a click. */
  const wasDrag = useCallback(() => (drag.current?.moved ?? 0) > 6, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2)
    },
    [zoomAt],
  )

  const reset = useCallback(() => setView(clamp({ k: fit, x: 0, y: 0 }, o)), [fit, o])

  /** Centre the view on a world point at the given zoom. */
  const goTo = useCallback(
    (wx: number, wy: number, k: number) =>
      setView(clamp({ k, x: o.viewW / 2 - wx * k, y: o.viewH / 2 - wy * k }, o)),
    [o],
  )

  return { view, ref, grabbing, wasDrag, zoomBy, reset, goTo, fit }
}
