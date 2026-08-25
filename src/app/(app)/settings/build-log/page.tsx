import { auth } from "@/lib/auth";
import { ENTRIES } from "@/content/build-log";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { getPageName } from "@/server/navigation";

export default async function BuildLogPage() {
  const session = await auth();
  const pageTitle = await getPageName(session!.user.organizationId, "/settings/build-log", "Build Log");

  // Entries carry a date only, so they are read as calendar dates in the same
  // frame formatDate renders them in.
  const parse = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const days = [...new Set(ENTRIES.map((e) => e.date))];

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${ENTRIES.length} change${ENTRIES.length === 1 ? "" : "s"} across ${days.length} day${
          days.length === 1 ? "" : "s"
        }, newest first.`}
      />

      <div className="space-y-4">
        {ENTRIES.map((entry, index) => (
          <Card key={`${entry.date}-${entry.pr ?? index}`}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-lg">{entry.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {entry.pr != null && <Badge variant="secondary">#{entry.pr}</Badge>}
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(parse(entry.date))}
                </span>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 border-t pt-4">
              <ul className="ml-4 list-disc space-y-1.5 text-sm">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>

              {entry.fixes && entry.fixes.length > 0 && (
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Fixed along the way
                  </p>
                  <ul className="mt-1.5 ml-4 list-disc space-y-1 text-sm">
                    {entry.fixes.map((fix) => (
                      <li key={fix}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
