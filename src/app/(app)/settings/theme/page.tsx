import { requireCard, requireSession } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeEditor } from "./theme-editor";

export default async function ThemePage() {
  const session = await requireSession();

  await requireCard("/settings/theme");
  const pageTitle = await getPageName(session.user.organizationId, "/settings/theme", "Theme");

  return (
    <div>
      <PageHeader title={pageTitle} description="Light or dark, and the accent colour used across the app" />
      <ThemeEditor />
    </div>
  );
}
