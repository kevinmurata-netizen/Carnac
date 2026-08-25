import { auth } from "@/lib/auth";
import { getFilterSchema } from "@/server/filter-schema";
import { listSavedFilters } from "@/server/saved-filters";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBuilder } from "./filter-builder";

export default async function FiltersPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [pageTitle, schema, saved] = await Promise.all([
    getPageName(organizationId, "/filters", "Filters"),
    getFilterSchema(organizationId),
    listSavedFilters(organizationId),
  ]);

  const fieldCount = schema.reduce((s, t) => s + t.fields.length, 0);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`Pick columns, set criteria, and save the result as a named filter — ${fieldCount} fields across ${schema.length} groups`}
      />
      <FilterBuilder schema={schema} saved={saved} />
    </div>
  );
}
