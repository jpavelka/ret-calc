// Lets TableOfContents ask an arbitrarily-nested CollapsibleSection to open
// itself without threading open-state through every component in between.
export const TOC_EXPAND_EVENT = 'toc-expand-section'

export interface TocExpandDetail {
  id: string
}
