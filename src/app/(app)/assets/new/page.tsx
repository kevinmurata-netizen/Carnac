import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getNewAssetForm } from "@/server/assets";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NewAssetForm } from "./new-asset-form";

/**
 * A new reservoir, well or station, entered by hand.
 *
 * The form is built from the type: its own attributes, and the components it
 * is made of, offered as a checklist because not every asset of a type has
 * every part.
 */
export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const session = await auth();
  if (!canRecordFieldData(session)) redirect("/assets");
  const organizationId = session!.user.organizationId;

  if (!type) redirect("/assets");
  const form = await getNewAssetForm(organizationId, type);
  if (!form) notFound();

  if (form.type.code === "WATERLINE") {
    return (
      <div>
        <PageHeader title="New waterline segment" />
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>A segment is a line with two ends, a length and a place in the network — more than a form can supply.</p>
            <p>
              Waterline segments come in through{" "}
              <Link href="/administration/import" className="text-primary hover:underline">
                Data Import
              </Link>
              , which brings their geometry with them.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={`New ${form.type.name}`} description="Recorded here, then scored as its components are inspected" />
      <NewAssetForm form={form} />
    </div>
  );
}
