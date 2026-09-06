/*
 * The two sidebar glyphs, in one place.
 *
 * The public page renders a static replica of the sidebar, and a replica that
 * quietly stops matching the thing it depicts is worse than no replica at all.
 * Both surfaces draw these.
 */

export function OverviewGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function QueueGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="currentColor">
      <rect x="1" y="2" width="14" height="3" rx="1.5" />
      <rect x="1" y="6.5" width="14" height="3" rx="1.5" opacity="0.55" />
      <rect x="1" y="11" width="9" height="3" rx="1.5" opacity="0.55" />
    </svg>
  );
}
