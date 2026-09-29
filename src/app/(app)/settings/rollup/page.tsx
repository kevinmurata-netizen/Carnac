import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getRollupSettings } from "@/server/rollup";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RollupEditor } from "./rollup-editor";

/**
 * Component roll-up: how an asset's component scores become one asset score.
 *
 * A strategy is chosen, not hard-coded, because "how good is this reservoir"
 * has more than one honest answer. The organization has a default; an asset
 * type may name its own. Every change that moves a score is previewed first —
 * the assets it would move, before and after — and applied only on request.
 */
export default async function RollupPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/rollup", "Component Roll-up");
  const { canWrite } = await requireCard("/settings/rollup");
  const settings = await getRollupSettings(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="How each asset's components roll up into one asset score — and what changing that would do, before it is done"
      />
      {!canWrite && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. You can preview a change, but not apply it.
        </div>
      )}
      <RollupEditor settings={settings} canWrite={canWrite} />
    </div>
  );
}
