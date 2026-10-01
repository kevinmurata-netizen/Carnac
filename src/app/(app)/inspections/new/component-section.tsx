"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ReadingInput } from "@/components/inspections/reading-input";
import type { VisitComponent } from "@/server/component-inspections";

/**
 * One component's part of a site visit. "Not inspected on this visit" takes
 * its inputs away — nothing is sent and nothing is required — so a crew that
 * only got to the pumps doesn't have to invent a roof rating.
 */
export function ComponentSection({ component }: { component: VisitComponent }) {
  const [skipped, setSkipped] = useState(false);
  const prefix = `comp:${component.id}`;

  return (
    <Card className={skipped ? "opacity-70" : undefined}>
      <input type="hidden" name="componentId" value={component.id} />
      <input type="hidden" name={`${prefix}:template`} value={component.templateId} />
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{component.label}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {component.templateName}
            {component.label !== component.componentTypeName && ` · ${component.componentTypeName}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={`${prefix}:skip`}
            checked={skipped}
            onChange={(e) => setSkipped(e.target.checked)}
            className="h-4 w-4"
          />
          Not inspected on this visit
        </label>
      </CardHeader>
      {!skipped && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {component.fields.map((field) => (
              <ReadingInput key={field.id} field={field} name={`${prefix}:field:${field.id}`} />
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-notes`}>Notes</Label>
            <textarea
              id={`${prefix}-notes`}
              name={`${prefix}:notes`}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The condition rating becomes this component&apos;s condition score (×10)
            {component.consequence != null
              ? `, and its risk is the probability that implies × a consequence of ${component.consequence}.`
              : ". No consequence of failure is set for this part, so it gets no risk score — set one under Settings › Asset Types."}{" "}
            The readings are kept with the visit as found.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
