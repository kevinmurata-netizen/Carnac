import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";

/**
 * What a page built on the engine's models shows before any asset type is
 * modelled — a new customer's first visit — instead of failing: what to do
 * first, in order, with the screens that do it.
 */
export function NothingModelled({ title, about }: { title: string; about: string }) {
  return (
    <div>
      <PageHeader title={title} description={about} />
      <div className="rounded-lg border border-dashed bg-muted/40 px-6 py-8 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Nothing is modelled yet.</p>
        <p className="mt-1 max-w-2xl">
          This page fills in once an asset type is modelled. To set one up:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>
            Add the asset type and what it records under{" "}
            <Link href="/settings/asset-types" className="text-primary hover:underline">
              Settings › Asset Types
            </Link>
            , then switch its modelling on there.
          </li>
          <li>
            Load its assets, and any inspection history, under{" "}
            <Link href="/administration/import" className="text-primary hover:underline">
              Data Import
            </Link>
            .
          </li>
        </ol>
      </div>
    </div>
  );
}
