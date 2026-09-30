"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatStatus } from "@/lib/format";
import type { getNewAssetForm } from "@/server/assets";
import { createAssetAction, type NewAssetState } from "./actions";

type Form = NonNullable<Awaited<ReturnType<typeof getNewAssetForm>>>;

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Listed here rather than imported from Prisma, which would pull the client
 * into the browser bundle for five strings. */
const STATUSES = ["ACTIVE", "INACTIVE", "PLANNED", "ABANDONED", "REMOVED"] as const;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NewAssetForm({ form }: { form: Form }) {
  const [state, action, pending] = useActionState<NewAssetState, FormData>(createAssetAction, { status: "idle" });
  const [code, setCode] = useState("");
  const [components, setComponents] = useState<string[]>(form.components.map((c) => c.id));
  const typeName = form.type.name.toLowerCase();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="typeCode" value={form.type.code} />

      {state.status === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{state.message}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="assetCode" label="Asset ID" hint="How this asset is referred to everywhere. Fixed once saved.">
            <input
              id="assetCode"
              name="assetCode"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. RSV-08"
              className={`${input} font-mono`}
            />
          </Field>
          <Field id="name" label="Name">
            <input id="name" name="name" placeholder={`e.g. Westside ${form.type.name}`} className={input} />
          </Field>
          <Field id="status" label="Status">
            <select id="status" name="status" defaultValue="ACTIVE" className={input}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="installationDate" label="Installed">
            <input id="installationDate" name="installationDate" type="date" className={input} />
          </Field>
          <Field id="expectedUsefulLife" label="Expected useful life (years)">
            <input id="expectedUsefulLife" name="expectedUsefulLife" type="number" min={1} step={1} className={input} />
          </Field>
          <Field id="ownerDepartment" label="Responsible department">
            <input id="ownerDepartment" name="ownerDepartment" placeholder="e.g. Water Operations" className={input} />
          </Field>
        </CardContent>
      </Card>

      {form.attributes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{form.type.name} Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {form.attributes.map((a) => {
              const id = `attr-${a.code}`;
              const label = `${a.label}${a.unit ? ` (${a.unit})` : ""}${a.isRequired ? " *" : ""}`;
              return (
                <Field key={a.code} id={id} label={label} hint={a.help ?? undefined}>
                  {a.dataType === "ENUM" && a.options.length > 0 ? (
                    <select id={id} name={`attr:${a.code}`} defaultValue="" required={a.isRequired} className={input}>
                      <option value="">Not recorded</option>
                      {a.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : a.dataType === "BOOLEAN" ? (
                    <select id={id} name={`attr:${a.code}`} defaultValue="" required={a.isRequired} className={input}>
                      <option value="">Not recorded</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      id={id}
                      name={`attr:${a.code}`}
                      required={a.isRequired}
                      type={a.dataType === "NUMBER" ? "number" : a.dataType === "DATE" ? "date" : "text"}
                      step={a.dataType === "NUMBER" ? "any" : undefined}
                      className={input}
                    />
                  )}
                </Field>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="lat" label="Latitude" hint="Places it on the map. Optional.">
            <input id="lat" name="lat" type="number" step="any" min={-90} max={90} className={input} />
          </Field>
          <Field id="lng" label="Longitude">
            <input id="lng" name="lng" type="number" step="any" min={-180} max={180} className={input} />
          </Field>
          <Field id="serviceArea" label="Service area">
            <input id="serviceArea" name="serviceArea" list="service-areas" className={input} />
            <datalist id="service-areas">
              {form.serviceAreas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field id="pressureZone" label="Pressure zone">
            <input id="pressureZone" name="pressureZone" list="pressure-zones" className={input} />
            <datalist id="pressure-zones">
              {form.pressureZones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            Service area and pressure zone are saved only with a position, because they belong to the asset&apos;s
            place on the map.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.components.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {form.type.name} has no components defined, so this {typeName} is scored as a whole. Components are added
              to the type under{" "}
              <Link href="/settings/asset-types" className="text-primary hover:underline">
                Settings › Asset Types
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Tick the parts this {typeName} has. Details — install dates, makes, costs — and more than one of a part
                are added on its page afterwards.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {form.components.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name="componentTypeId"
                      value={c.id}
                      checked={components.includes(c.id)}
                      onChange={(e) =>
                        setComponents(e.target.checked ? [...components, c.id] : components.filter((id) => id !== c.id))
                      }
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">{c.name}</span>
                      {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" nativeButton={false} render={<Link href={`/assets?type=${form.type.code}`}>Cancel</Link>} />
        <Button type="submit" disabled={pending || !code.trim()}>
          {pending ? "Saving…" : `Add ${typeName}`}
        </Button>
      </div>
    </form>
  );
}
