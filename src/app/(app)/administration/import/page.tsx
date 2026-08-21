import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { IMPORT_COLUMNS, IMPORT_TEMPLATE_HEADER, IMPORT_SAMPLE_ROWS } from "@/server/import";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImportForm } from "./import-form";
import { getPageName } from "@/server/navigation";

export default async function ImportPage() {
  const session = await auth();
  const pageTitle = await getPageName(session!.user.organizationId, "/administration/import", "Data Import");
  if (!canRecordFieldData(session)) redirect("/administration");

  const template = [IMPORT_TEMPLATE_HEADER, ...IMPORT_SAMPLE_ROWS].join("\n");

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Load waterline inventory from CSV — validated in full before anything is written"
      />

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
              {IMPORT_COLUMNS.map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell>
                    {c.required ? <Badge variant="default">Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{NOTES[c.key] ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Column order does not matter and unrecognised columns are ignored. GeoJSON and shapefile import are the
            natural next step; the validation and commit stages are already separated to accommodate them.
          </p>
        </CardContent>
      </Card>

      <ImportForm templateCsv={template} />
    </div>
  );
}

const NOTES: Record<string, string> = {
  assetCode: "Must be unique — checked against existing assets and the rest of the file.",
  material: "Must match a configured material exactly.",
  diameter: "Inches, 1–120.",
  installationYear: "Whole year, 1850 to present.",
  length: "Feet, 1–100,000.",
  latitude: "Decimal degrees, -90 to 90.",
  longitude: "Decimal degrees, -180 to 180.",
  condition: "Optional WCI 0–100; recorded as a manual condition measurement.",
  criticality: "Optional; must match a configured criticality level.",
  customersServed: "Optional whole number.",
  serviceArea: "Optional free text.",
};
