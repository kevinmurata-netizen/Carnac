import { auth } from "@/lib/auth";
import { listWishlist } from "@/server/wishlist";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { WishlistEditor } from "./wishlist-editor";

export default async function WishlistPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration/wishlist", "Wishlist");

  const items = await listWishlist(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Requests, ideas and things to fix — anyone signed in can add, edit or tick one off"
      />
      <WishlistEditor items={items} />
    </div>
  );
}
