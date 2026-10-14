import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCard } from "@/server/guard";
import { canRecordFieldData } from "@/lib/permissions";
import Link from "next/link";
import { getImportSpec, templateHeader } from "@/server/import";
import { getInspectionImportSpec, inspectionTemplateHeader } from "@/server/inspection-import";
import type { ImportKind } from "./state";
import { chooseModelledAssetType } from "@/server/modelled-asset-type";
import { PageHeader } from "@/components/layout/page-header";
import { AssetTypePills } from "@/components/layout/asset-type-pills";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImportForm } from "./import-form";
import { getPageName } from "@/server/navigation";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; kind?: string }>;
}) {
  const { type: requestedType, kind: requestedKind } = await searchParams;
  const kind: ImportKind = requestedKind === "inspections" ? "inspections" : "assets";
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
  const spec = kind === "inspections" ? await getInspectionImportSpec(organizationId, chosen.id) : await getImportSpec(organizationId, chosen.id);
  const header =
    kind === "inspections"
      ? inspectionTemplateHeader(spec as Awaited<ReturnType<typeof getInspectionImportSpec>>)
      : templateHeader(spec);
  const formName = "templateName" in spec ? spec.templateName : null;
  const query = (patch: { type?: string; kind?: ImportKind }) => {
    const p = new URLSearchParams({ type: patch.type ?? chosen.id });
    if ((patch.kind ?? kind) === "inspections") p.set("kind", "inspections");
    return `/administration/import?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={
          kind === "inspections"
            ? `Load ${spec.assetTypeName.toLowerCase()} inspection history from CSV — validated in full before anything is written`
            : `Load ${spec.assetTypeName.toLowerCase()} inventory from CSV — validated in full before anything is written`
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["assets", "inspections"] as const).map((k) => (
          <Link
            key={k}
            href={query({ kind: k })}
            className={`rounded-md border px-2.5 py-1 text-sm ${
              k === kind ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {k === "assets" ? "Assets" : "Inspections"}
          </Link>
        ))}
      </div>

      <AssetTypePills types={types} selectedId={chosen.id} href={(id) => query({ type: id })} />

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
            {kind === "inspections" ? (
              formName ? (
                <>
                  One row per inspection. The question columns are those on {spec.assetTypeName}&apos;s{" "}
                  {formName} form (Settings › Inspection Templates); a column can be headed by a question&apos;s label
                  or its code, and a question left blank is recorded as unanswered.
                </>
              ) : (
                <>{spec.assetTypeName} has no active inspection form, so there is nothing to file inspections against.</>
              )
            ) : (
              <>
                The columns are {spec.assetTypeName}&apos;s attributes, as set under Settings › Asset Types; a column
                can be headed by an attribute&apos;s label or its code.
              </>
            )}{" "}
            Column order does not matter and unrecognised columns are ignored.
          </p>
        </CardContent>
      </Card>

      {/* Keyed by kind and type, so switching either starts from that template. */}
      <ImportForm
        key={`${kind}:${chosen.id}`}
        kind={kind}
        assetTypeId={chosen.id}
        assetTypeName={spec.assetTypeName}
        templateCsv={header}
      />
    </div>
  );
}
