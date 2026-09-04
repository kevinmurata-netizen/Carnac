import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getRecentActivity } from "@/server/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPageName } from "@/server/navigation";

export default async function ActivityPage() {
  const session = await auth();
  await requireCard("/administration/activity");
  const pageTitle = await getPageName(session!.user.organizationId, "/administration/activity", "Activity & Audit");
  const activity = await getRecentActivity(session!.user.organizationId, 100);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Recent changes derived from the created/updated audit fields carried on the records themselves"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {activity.map((a, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs">{a.when.toLocaleString("en-US")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.entity}</Badge>
                  </TableCell>
                  <TableCell>{a.action}</TableCell>
                  <TableCell className="text-xs">{a.detail}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.actor ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            This view reads the audit columns already on each record. A dedicated append-only audit log — capturing
            field-level before/after values and the acting user for every write — would need its own table and
            migration; the schema&apos;s createdBy/updatedBy fields are the foundation for it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
