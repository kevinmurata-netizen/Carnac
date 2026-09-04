import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getDatabaseInfo } from "@/server/admin";
import { getPageName } from "@/server/navigation";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { Database } from "lucide-react";

export default async function DatabasePage() {
  const session = await auth();

  await requireCard("/settings/database");
  const organizationId = session!.user.organizationId;

  const [pageTitle, db] = await Promise.all([
    getPageName(organizationId, "/settings/database", "Database Connection"),
    getDatabaseInfo(),
  ]);

  return (
    <div>
      <PageHeader title={pageTitle} description="Where the data lives, and whether the application can reach it" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" /> Connection
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
          <p className="mt-2 text-xs text-muted-foreground">
            Deployments do not run migrations — a schema change is applied deliberately with{" "}
            <span className="font-mono">npm run db:deploy</span> before pushing, so a deploy cannot fail because
            another deploy is in flight.
          </p>
        </CardContent>
      </Card>
    </div>
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
