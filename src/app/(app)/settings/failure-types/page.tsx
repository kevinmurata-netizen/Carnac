import { auth } from "@/lib/auth";
import { listFailureTypes } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FailureTypeEditor } from "./editor";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";

export default async function FailureTypesPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/failure-types", "Failure Types");
  const isAdmin = session!.user.roleName === "Administrator";

  const types = await listFailureTypes(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Reference data for recording what went wrong when a segment fails"
      />

      {isAdmin ? (
        <FailureTypeEditor types={types} />
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
