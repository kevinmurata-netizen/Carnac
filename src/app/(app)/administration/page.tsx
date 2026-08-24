import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listUsers, getRecentActivity, getDatabaseInfo, type DatabaseInfo } from "@/server/admin";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { Database, FileUp, ListChecks, ListTodo, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { getPageName } from "@/server/navigation";
import { getWishlistSummary } from "@/server/wishlist";

/**
 * Operational administration — people, field definitions, data loading, the
 * audit trail and the database itself. Modelling and business configuration
 * (scoring, deterioration, risk, treatments) lives at /settings.
 */
export default async function AdministrationPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration", "Administration");

  const [users, activity, db, wishlist] = await Promise.all([
    listUsers(organizationId),
    getRecentActivity(organizationId, 15),
    getDatabaseInfo(),
    getWishlistSummary(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Users and roles, field definitions, data import, audit trail and database status"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LinkCard
          href="/administration/users"
          icon={<Users className="h-5 w-5" />}
          title="Users & Roles"
          detail={`${formatNumber(users.length)} users across ${new Set(users.map((u) => u.roleName)).size} roles`}
        />
        <LinkCard
          href="/administration/fields"
          icon={<ListChecks className="h-5 w-5" />}
          title="Fields"
          detail="Inspection questions and inventory attributes"
        />
        <LinkCard
          href="/administration/import"
          icon={<FileUp className="h-5 w-5" />}
          title="Data Import"
          detail={canRecordFieldData(session) ? "Load inventory from CSV" : "Requires write access"}
        />
        <LinkCard
          href="/administration/wishlist"
          icon={<ListTodo className="h-5 w-5" />}
          title="Wishlist"
          detail={
            wishlist.total === 0
              ? "Requests and ideas from the team"
              : `${formatNumber(wishlist.open)} open${wishlist.highOpen > 0 ? `, ${wishlist.highOpen} high priority` : ""}`
          }

        />

        <LinkCard
          href="/administration/activity"
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Activity & Audit"
          detail="Recent changes across the system"
        />
      </div>

      <DatabaseCard db={db} />

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Activity</CardTitle>
          <Link href="/administration/activity" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </CardHeader>
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
        </CardContent>
      </Card>

      <div className="mt-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Looking for the Condition Index, treatment library or model definitions? Those are business configuration
        rather than administration and now live under{" "}
        <Link href="/settings" className="inline-flex items-center gap-1 text-primary hover:underline">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Settings
        </Link>
        .
      </div>
    </div>
  );
}

function DatabaseCard({ db }: { db: DatabaseInfo }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" /> Database Connection
          <Badge variant={db.reachable ? "default" : "destructive"} className="ml-1">
            {db.reachable ? "Connected" : "Unreachable"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {db.error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {db.error}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Host" value={db.host ? `${db.host}:${db.port}` : "—"} />
          <Field label="Database" value={db.database ?? "—"} />
          <Field label="User" value={db.user ?? "—"} />
          <Field label="SSL" value={db.ssl ? "Required" : "Disabled"} />
          <Field label="Server" value={db.serverVersion ?? "—"} />
          <Field label="PostGIS" value={db.postgisVersion ?? "Not installed"} />
          <Field label="Size on Disk" value={db.sizeOnDisk ?? "—"} />
          <Field label="Tables" value={db.tableCount != null ? formatNumber(db.tableCount) : "—"} />
          <Field
            label="Migrations Applied"
            value={db.migrationsApplied != null ? formatNumber(db.migrationsApplied) : "—"}
          />
          <div className="col-span-2 lg:col-span-3">
            <dt className="text-xs font-medium text-muted-foreground">Latest Migration</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{db.latestMigration ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Read from the live connection, so a stale or wrong <span className="font-mono">DATABASE_URL</span> shows as
          unreachable rather than silently reporting health. Credentials are never read out of the connection string.
          PostGIS is what stores {ASSET_LABEL.lower} geometry for the network map.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function LinkCard({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div>
            <div className="font-medium text-foreground">{title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
