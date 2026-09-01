import { auth } from "@/lib/auth";
import { assistantConfigured } from "@/server/assistant";
import { PageHeader } from "@/components/layout/page-header";
import { getPageName } from "@/server/navigation";
import { AskPanel } from "./ask-panel";
import { askAction } from "./actions";

export default async function AskPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/ask", "AI Assistant");
  const configured = assistantConfigured();

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Ask about the network in plain English and get the segments back."
      />

      {!configured && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          The assistant needs an <code className="rounded bg-muted px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> in the
          environment before it can answer. Everything else on this page works as soon as one is set — no other
          configuration.
        </div>
      )}

      <AskPanel ask={askAction} configured={configured} />
    </div>
  );
}
