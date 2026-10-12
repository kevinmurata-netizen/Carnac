import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCard } from "@/server/guard";
import { canRecordFieldData } from "@/lib/permissions";
import { getImportSpec, templateHeader } from "@/server/import";
import { chooseModelledAssetType } from "@/server/modelled-asset-type";
import { PageHeader } from "@/components/layout/page-header";
import { AssetTypePills } from "@/components/layout/asset-type-pills";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImportForm } from "./import-form";
import { getPageName } from "@/server/navigation";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: requestedType } = await searchParams;
  const session = await auth();
  await requireCard("/administration/import");
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration/import", "Data Import");
  if (!canRecordFieldData(session)) redirect("/administration");

  // Any of the organization's asset types can be imported, modelled or not.
  // Without a choice, the main modelled network's.
  const [types, { selected }] = await Promise.all([
    prisma.assetType.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    chooseModelledAssetType(organizationId),
  ]);
  const chosen = types.find((t) => t.id === requestedType) ?? types.find((t) => t.id === selected?.id) ?? types[0];
  if (!chosen) {
    return (
      <div>
        <PageHeader title={pageTitle} description="Load inventory from CSV" />
        <p className="text-sm text-muted-foreground">Add an asset type under Settings › Asset Types first.</p>
      </div>
    );
  }
  const spec = await getImportSpec(organizationId, chosen.id);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`Load ${spec.assetTypeName.toLowerCase()} inventory from CSV — validated in full before anything is written`}
      />

      <AssetTypePills types={types} selectedId={chosen.id} href={(id) => `/administration/import?type=${id}`} />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Expected Columns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spec.columns.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell>
                    {c.required ? <Badge variant="default">Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">{c.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            The columns are {spec.assetTypeName}&apos;s attributes, as set under Settings › Asset Types; a column
            can be headed by an attribute&apos;s label or its code. Column order does not matter and unrecognised
            columns are ignored.
          </p>
        </CardContent>
      </Card>

      {/* Keyed by type, so switching tabs starts from that type's template. */}
      <ImportForm
        key={chosen.id}
        assetTypeId={chosen.id}
        assetTypeName={spec.assetTypeName}
        templateCsv={templateHeader(spec)}
      />
    </div>
  );
}
