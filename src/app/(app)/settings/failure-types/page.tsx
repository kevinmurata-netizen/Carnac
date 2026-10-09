import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listFailureTypes } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FailureTypeEditor } from "./editor";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";
import { chooseModelledAssetType } from "@/server/modelled-asset-type";
import { AssetTypePills } from "@/components/layout/asset-type-pills";

export default async function FailureTypesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: requestedType } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/failure-types", "Failure Types");
  const { canWrite: canEdit } = await requireCard("/settings/failure-types");

  // A reservoir and a pipe fail in different ways, so each type keeps its own list.
  const { types: assetTypes, selected } = await chooseModelledAssetType(organizationId, requestedType);
  const types = await listFailureTypes(organizationId, selected?.id);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Reference data for recording what went wrong when a segment fails"
      />

      <AssetTypePills
        types={assetTypes}
        selectedId={selected?.id}
        href={(id) => `/settings/failure-types?type=${id}`}
      />

      {canEdit ? (
        <FailureTypeEditor types={types} assetTypeId={selected?.id} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Recorded Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell>{formatNumber(t.eventCount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
