import Link from "next/link";
import { auth } from "@/lib/auth";
import { getNavOverrides } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

/**
 * Where a page a role cannot open sends you.
 *
 * Deliberately not a 404: the page exists, and saying it does not would send
 * someone hunting for a broken link instead of asking for access. It names the
 * page and the role so the ask is a specific one.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const session = await auth();
  const overrides = await getNavOverrides(session!.user.organizationId);

  // Only ever a name we already know, never the raw parameter — this value
  // comes off the URL, so echoing it back verbatim would be someone else's
  // text rendered on our page.
  const known = from && Object.prototype.hasOwnProperty.call(overrides, from) ? overrides[from] : null;
  const pageName = known ?? (from && /^\/[a-z0-9/-]*$/i.test(from) ? from : null);

  return (
    <div>
      <PageHeader title="No access" description="Your role does not have permission to open this page" />

      <Card>
        <CardContent className="space-y-3 py-6 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Lock className="h-4 w-4" />
            {pageName ? <span>{pageName} is closed to your role.</span> : <span>That page is closed to your role.</span>}
          </div>
          <p className="text-muted-foreground">
            You are signed in as {session!.user.roleName}. An Administrator can change what this role reaches under
            Roles &amp; Permissions.
          </p>
          <p>
            <Link href="/dashboard" className="text-primary hover:underline">
              Back to the dashboard
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
