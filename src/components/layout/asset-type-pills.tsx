import Link from "next/link";

/**
 * Tabs for the asset type a settings screen is showing, as links (`?type=<id>`)
 * so a view is a URL someone can send. Not shown with a single type: the
 * screen is then simply that type's, as it always was.
 */
export function AssetTypePills({
  types,
  selectedId,
  href,
  note,
}: {
  types: Array<{ id: string; name: string }>;
  selectedId: string | null | undefined;
  /** Where each tab goes, given the type's id. */
  href: (typeId: string) => string;
  /** A short fact beside each name — what is set up for it, say. */
  note?: (typeId: string) => string | null;
}) {
  if (types.length < 2) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {types.map((t) => {
        const active = t.id === selectedId;
        const extra = note?.(t.id);
        return (
          <Link
            key={t.id}
            href={href(t.id)}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-transparent bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {t.name}
            {extra && <span className="ml-1.5 opacity-70">{extra}</span>}
          </Link>
        );
      })}
    </div>
  );
}
