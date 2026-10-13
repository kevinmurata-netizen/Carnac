"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/layout/brand-logo";
import { BRAND_LOGOS, DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { saveBrandingAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * The branding form, with a live preview of the sidebar's header and the
 * inventory's title — the two places the words show most.
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
                <Label htmlFor="productName">Name</Label>
                <input
                  id="productName"
                  name="productName"
                  value={draft.productName}
                  onChange={(e) => set({ productName: e.target.value })}
                  disabled={!canEdit}
                  className={input}
                />
                <p className="text-xs text-muted-foreground">In the sidebar and the browser tab.</p>
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
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <input type="hidden" name="logo" value={draft.logo} />
              <div className="flex flex-wrap gap-2">
                {BRAND_LOGOS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => set({ logo: l.key })}
                    aria-pressed={draft.logo === l.key}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      draft.logo === l.key ? "border-primary bg-primary/10" : "hover:border-primary/50"
                    }`}
                  >
                    <BrandLogo logo={l.key} className="h-4 w-4" />
                    {l.label}
                  </button>
                ))}
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
              <span className="text-lg font-semibold tracking-tight">{draft.productName || DEFAULT_BRANDING.productName}</span>
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
