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
  return (
    <div className="sticky bottom-0 z-20 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">{status}</div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
