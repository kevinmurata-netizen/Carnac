"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { saveTemplateAction, toggleTemplateActiveAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";
import type { TemplateDetail } from "@/server/settings";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TemplateEditor({
  template,
  assetTypeName,
}: {
  template: TemplateDetail;
  assetTypeName: string;
}) {
  const [state, action] = useActionState(saveTemplateAction, EMPTY_SETTINGS_STATE);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={template.id} />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle className="text-base">{template.name}</CardTitle>
            <Badge variant="outline">{assetTypeName}</Badge>
          </div>
          <ActiveToggle
            id={template.id}
            isActive={template.isActive}
            action={toggleTemplateActiveAction}
            activeHint="Click to deactivate — this form stops being offered for new inspections"
            inactiveHint="Click to activate — this form can be used for new inspections again"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`t-name-${template.id}`}>Name</Label>
              <input id={`t-name-${template.id}`} name="name" defaultValue={template.name} className={input} required />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor={`t-desc-${template.id}`}>Description</Label>
              <input
                id={`t-desc-${template.id}`}
                name="description"
                defaultValue={template.description ?? ""}
                className={input}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(template.fieldCount)} question{template.fieldCount === 1 ? "" : "s"} ·{" "}
            {formatNumber(template.inspectionCount)} inspection{template.inspectionCount === 1 ? "" : "s"} recorded.
            Deactivating a template stops it being offered for new inspections; existing inspections keep their
            answers. The questions themselves are edited under Administration → Fields.
          </p>
          <SaveBar state={state} label="Save template" />
        </CardContent>
      </Card>
    </form>
  );
}
