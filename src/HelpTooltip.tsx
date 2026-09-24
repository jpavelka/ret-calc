import { useEffect, useRef } from 'react'

interface HelpTooltipProps {
  text: string
}

// A lightweight "?" popover built on <details>/<summary>.
export function HelpTooltip({ text }: HelpTooltipProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const el = detailsRef.current
    if (!el) return
    const onPointerDown = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <details ref={detailsRef} className="group relative inline-block">
      <summary
        className="flex h-4 w-4 list-none cursor-pointer items-center justify-center rounded-full border border-slate-300 text-[10px] leading-none text-slate-500 marker:hidden hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden"
        aria-label="What does this mean?"
      >
        ?
      </summary>
      <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal leading-snug text-slate-600 shadow-md">
        {text}
      </div>
    </details>
  )
}
