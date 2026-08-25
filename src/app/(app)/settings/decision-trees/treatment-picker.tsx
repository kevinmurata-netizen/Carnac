"use client";

import { useRouter } from "next/navigation";

/** Which treatment's trees are being edited. It lives in the URL so a
 * particular treatment's rules are a link you can send someone. */
export function TreatmentPicker({
  treatments,
  selectedId,
}: {
  treatments: Array<{ id: string; name: string; treeCount: number }>;
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="treatment" className="text-xs font-medium text-muted-foreground">
          Treatment
        </label>
        <select
          id="treatment"
          value={selectedId}
          onChange={(e) => router.push(`/settings/decision-trees?treatment=${e.target.value}`)}
          className="h-9 w-72 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.treeCount > 0 ? ` · ${t.treeCount} tree${t.treeCount === 1 ? "" : "s"}` : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="pb-1.5 text-xs text-muted-foreground">
        {treatments.filter((t) => t.treeCount > 0).length} of {treatments.length} treatments have a decision tree.
      </p>
    </div>
  );
}
