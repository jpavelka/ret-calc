interface HelpTooltipProps {
  text: string
}

// A lightweight "?" popover built on <details>/<summary> so it needs no
// click-outside-to-close JS — toggling the <summary> opens/closes it natively.
export function HelpTooltip({ text }: HelpTooltipProps) {
  return (
    <details className="group relative inline-block">
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
