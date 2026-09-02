import { auth } from "@/lib/auth";
import { listWishlist, listWishlistLocations, countWishlistByLocation } from "@/server/wishlist";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { WishlistEditor } from "./wishlist-editor";

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration/wishlist", "Wishlist");

  const [items, locations, counts] = await Promise.all([
    listWishlist(organizationId, { location }),
    listWishlistLocations(organizationId),
    countWishlistByLocation(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Requests, ideas and things to fix — anyone signed in can add, edit or tick one off"
      />
      <WishlistEditor
        items={items}
        locations={locations}
        counts={{ byHref: Object.fromEntries(counts.byHref), untagged: counts.untagged }}
        activeLocation={location ?? ""}
      />
    </div>
  );
}
