"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BrandLogo, BrandName } from "@/components/layout/brand-logo";
import type { Branding } from "@/lib/branding";
import { saveBrandingAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * The branding form, with a live preview of the sidebar's header and the
 * inventory's title — the two places the words show most. The product's name
 * and logo are shown, not offered: they are set for the site.
 */
export function BrandingEditor({ branding, canEdit }: { branding: Branding; canEdit: boolean }) {
  const [state, action] = useActionState(saveBrandingAction, EMPTY_SETTINGS_STATE);
  const [draft, setDraft] = useState(branding);
  const set = (patch: Partial<Branding>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name and logo</Label>
                <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm">
                  <BrandLogo logo={draft.logo} className="h-4 w-4" />
                  <BrandName name={draft.productName} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Set for this site by your provider, in the sidebar and the browser tab.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tagline">Tagline</Label>
                <input
                  id="tagline"
                  name="tagline"
                  value={draft.tagline}
                  onChange={(e) => set({ tagline: e.target.value })}
                  disabled={!canEdit}
                  placeholder="e.g. Asset Management Platform"
                  className={input}
                />
                <p className="text-xs text-muted-foreground">On the login screen and at the foot of the sidebar.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-sidebar px-4 py-3 text-sidebar-foreground">
              <BrandLogo logo={draft.logo} className="h-6 w-6 text-sidebar-primary" />
              <BrandName name={draft.productName} className="min-w-0 break-all text-base" />
            </div>
            <p className="text-xs text-muted-foreground">{draft.tagline}</p>
            <p className="text-sm">
              <span className="font-medium">{draft.assetPlural || "…"} Inventory</span>
              <span className="text-muted-foreground"> · {draft.assetSingular || "…"} ID</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the network&apos;s assets are called</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assetSingular">One</Label>
              <input
                id="assetSingular"
                name="assetSingular"
                value={draft.assetSingular}
                onChange={(e) => set({ assetSingular: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. Asset"
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assetPlural">Several</Label>
              <input
                id="assetPlural"
                name="assetPlural"
                value={draft.assetPlural}
                onChange={(e) => set({ assetPlural: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. Assets"
                className={input}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Used for the inventory page and its sidebar entry, the sidebar section above Inspections and column
            headings such as &ldquo;{draft.assetSingular || "…"} ID&rdquo;. A page or section renamed under Settings ›
            Navigation keeps its own name.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="itemSingular">One, in a sentence</Label>
              <input
                id="itemSingular"
                name="itemSingular"
                value={draft.itemSingular}
                onChange={(e) => set({ itemSingular: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. asset"
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="itemPlural">Several, in a sentence</Label>
              <input
                id="itemPlural"
                name="itemPlural"
                value={draft.itemPlural}
                onChange={(e) => set({ itemPlural: e.target.value })}
                disabled={!canEdit}
                placeholder="e.g. assets"
                className={input}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            How a sentence or a count refers to them: &ldquo;every {draft.itemSingular || "…"}&rdquo;, &ldquo;12{" "}
            {draft.itemPlural || "…"} need work&rdquo;, and columns such as &ldquo;
            {draft.itemSingular ? draft.itemSingular.charAt(0).toUpperCase() + draft.itemSingular.slice(1) : "…"}
            &rdquo;.
          </p>
          {canEdit && <SaveBar state={state} label="Save branding" />}
        </CardContent>
      </Card>
    </form>
  );
}
