import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const PANEL_WIDTH = 240
// A rough over-estimate of the sticky Year+Age columns' combined width
// (52 + up to 80, see ProjectionTable.tsx) — a button scrolled behind them
// horizontally is unusable, so its popover should just close.
const STICKY_COLUMNS_WIDTH = 140

interface Position {
  left: number
  // Distance from the relevant viewport edge — top when opening downward,
  // bottom when opening upward (openUp true).
  offset: number
  openUp: boolean
}

// A "?" button whose popup is portaled to <body> and positioned from the
// button's live bounding rect, instead of a plain CSS-positioned popup
// anchored inside the triggering element. Table cells that use this live
// inside a container with both horizontal and vertical scroll
// (overflow-auto) plus sticky Year/Age columns — a plain `position: absolute`
// popup there would get clipped by the scroll container or misaligned
// against the sticky columns. Fixed-position + portal sidesteps both.
//
// Like HelpTooltip, built on <details>/<summary>, closing on an outside
// click — but since the panel is portaled outside `<details>`'s own DOM
// subtree, that check also has to cover clicks landing inside the panel.
// Unlike HelpTooltip, the panel must also track the button across
// scroll/resize while open, and close itself if the button scrolls out of
// view or behind the sticky columns.
export function CellHelp({
  label,
  children,
  width = PANEL_WIDTH,
}: {
  label: string
  children: ReactNode
  // Wider than the default for popups with denser content (e.g. the full
  // Taxes breakdown), which otherwise wrap awkwardly at PANEL_WIDTH.
  width?: number
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)

  const reposition = useCallback(() => {
    const el = detailsRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < STICKY_COLUMNS_WIDTH) {
      el.open = false
      return
    }
    const openUp = rect.top > window.innerHeight * 0.6
    setPos({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      offset: openUp ? window.innerHeight - rect.top + 4 : rect.bottom + 4,
      openUp,
    })
  }, [width])

  useEffect(() => {
    const el = detailsRef.current
    if (!el) return
    const onToggle = () => {
      setOpen(el.open)
      if (el.open) reposition()
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [reposition])

  useEffect(() => {
    if (!open) return
    let raf = 0
    const onScrollOrResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(reposition)
    }
    // capture: fires for the table's own inner overflow-auto scroll too,
    // since plain (bubbling) 'scroll' listeners on window never see it.
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const el = detailsRef.current
    if (!el) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      // The panel is portaled to <body>, outside `el`'s DOM subtree, so a
      // click inside it must be checked separately or it'd look "outside".
      if (!el.contains(target) && !panelRef.current?.contains(target)) el.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <details ref={detailsRef} className="inline-block">
      <summary
        className="flex h-3.5 w-3.5 list-none cursor-pointer items-center justify-center rounded-full border border-slate-300 text-[9px] leading-none text-slate-500 marker:hidden hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden"
        aria-label={`${label} breakdown`}
      >
        ?
      </summary>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: pos.left,
              width,
              ...(pos.openUp ? { bottom: pos.offset } : { top: pos.offset }),
            }}
            className="z-50 max-h-[60vh] overflow-auto rounded-md border border-slate-200 bg-white p-2 text-xs font-normal leading-snug text-slate-600 shadow-md"
          >
            <p className="mb-1 font-semibold text-slate-700">{label}</p>
            {children}
          </div>,
          document.body,
        )}
    </details>
  )
}
