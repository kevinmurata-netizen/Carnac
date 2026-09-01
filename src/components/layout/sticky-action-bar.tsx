/**
 * A bar pinned to the bottom of the window, holding a page's save controls.
 *
 * Long pages put the thing you change at the top and the button that commits
 * it at the bottom; this keeps them both in view. It relies on the app shell
 * being fixed to the viewport with `main` doing the scrolling — under a
 * page-scrolling layout `sticky` has nothing to hold on to.
 *
 * Shared rather than repeated so the two editors that use it cannot drift
 * apart in spacing or behaviour.
 */
export function StickyActionBar({
  status,
  children,
}: {
  /** Left side: what state the record is in, and the result of the last save. */
  status: React.ReactNode;
  /** Right side: the buttons. */
  children: React.ReactNode;
}) {
  // Two things make the bar reach the window edge rather than floating above
  // it with page content sliding past underneath:
  //
  //  - the negative x-margins cancel <main>'s side padding, so it spans the
  //    full width of the content area;
  //  - the ::after strip covers <main>'s bottom padding. A sticky element
  //    cannot be pushed into that band — the browser resolves `bottom: 0`
  //    against the scrollport's content edge, so a negative bottom margin is
  //    simply ignored — and the band is inside the scrollport, so scrolled
  //    content shows through it.
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-card/95 after:backdrop-blur sm:-mx-6 sm:px-6 sm:after:h-6 supports-[backdrop-filter]:bg-card/75 supports-[backdrop-filter]:after:bg-card/75">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{status}</div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
