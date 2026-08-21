"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { ConfigurationSettings } from "@/server/settings";
import { saveAssetTypeAction, createAssetTypeAction, saveTemplateAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type AssetType = ConfigurationSettings["assetTypes"][number];
type Template = ConfigurationSettings["templates"][number];

export function AssetTypeEditor({ assetType }: { assetType: AssetType }) {
  const [state, action] = useActionState(saveAssetTypeAction, EMPTY_SETTINGS_STATE);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={assetType.id} />
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base">{assetType.name}</CardTitle>
          <Badge variant="secondary" className="font-mono">
            {assetType.code}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`at-name-${assetType.id}`}>Display Name</Label>
              <input
                id={`at-name-${assetType.id}`}
                name="name"
                defaultValue={assetType.name}
                className={input}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`at-desc-${assetType.id}`}>Description</Label>
              <input
                id={`at-desc-${assetType.id}`}
                name="description"
                defaultValue={assetType.description ?? ""}
                className={input}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(assetType.assetCount)} records. The code{" "}
            <span className="font-mono">{assetType.code}</span> is fixed — the domain modules and every server query
            select on it, so renaming it would detach this data from the logic that reads it.
          </p>
          <SaveBar state={state} label="Save type" />
        </CardContent>
      </Card>
    </form>
  );
}

export function TemplateEditor({ template }: { template: Template }) {
  const [state, action] = useActionState(saveTemplateAction, EMPTY_SETTINGS_STATE);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={template.id} />
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base">{template.name}</CardTitle>
          <Badge variant={template.isActive ? "default" : "secondary"}>
            {template.isActive ? "Active" : "Inactive"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`t-name-${template.id}`}>Name</Label>
              <input id={`t-name-${template.id}`} name="name" defaultValue={template.name} className={input} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`t-desc-${template.id}`}>Description</Label>
              <input
                id={`t-desc-${template.id}`}
                name="description"
                defaultValue={template.description ?? ""}
                className={input}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={template.isActive}
                  className="h-4 w-4 accent-primary"
                />
                Active
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(template.fieldCount)} fields · {formatNumber(template.inspectionCount)} inspections
            recorded. Deactivating a template stops it being offered for new inspections; existing inspections keep
            their answers. The questions themselves are edited under Administration → Fields.
          </p>
          <SaveBar state={state} label="Save template" />
        </CardContent>
      </Card>
    </form>
  );
}

export function NewAssetTypeForm() {
  const [state, action] = useActionState(createAssetTypeAction, EMPTY_SETTINGS_STATE);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Add an Asset Class</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <input id="code" name="code" required placeholder="e.g. SEWER" className={input} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Display Name</Label>
              <input id="name" name="name" required placeholder="e.g. Sewer Main" className={input} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <input id="description" name="description" className={input} />
            </div>
          </div>
          <SaveBar
            state={state}
            label="Add asset class"
            hint="A new class starts empty — it needs attributes, an inspection template and models before assets can be recorded against it."
          />
        </form>
      </CardContent>
    </Card>
  );
}
