"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveBar } from "@/app/(app)/settings/save-bar";
import { EMPTY_SETTINGS_STATE, type SettingsActionState } from "@/app/(app)/settings/state";
import { Eye, FileText, LayoutGrid, Lock, Pencil } from "lucide-react";
import type { PermissionSection, ResourceAccess } from "@/server/permissions";

type Row = { resource: string; label: string; href: string; kind: "page" | "card"; locked: boolean };

/**
 * One role's permissions, as a grid of three checkboxes per page and card.
 *
 * Read is the gate: unticking it disables the other two here and clears them
 * on the server, because "may write but not open" is a contradiction the UI
 * should not let you express in the first place. Visible is deliberately the
 * weakest of the three — it hides the entry, it does not close the page — and
 * the caption says so, since a permissions screen that implies otherwise is
 * worse than none.
 */
export function PermissionMatrix({
  roleId,
  roleName,
  isAdministrator,
  sections,
  save,
  reset,
}: {
  roleId: string;
  roleName: string;
  isAdministrator: boolean;
  sections: PermissionSection[];
  save: (prev: SettingsActionState, form: FormData) => Promise<SettingsActionState>;
  reset: (prev: SettingsActionState, form: FormData) => Promise<SettingsActionState>;
}) {
  const [saveState, saveAction] = useActionState(save, EMPTY_SETTINGS_STATE);
  const [resetState, resetAction] = useActionState(reset, EMPTY_SETTINGS_STATE);

  // Held here so unticking Read can grey out the row immediately rather than
  // only after a save round-trip.
  const [access, setAccess] = useState<Record<string, ResourceAccess>>(() =>
    Object.fromEntries(sections.flatMap((s) => s.rows.map((r) => [r.resource, r.access])))
  );

  // A different role was chosen: reload the grid rather than keep showing the
  // previous role's ticks. Compared against state, not a ref, so React
  // discards this render and re-renders with nothing stale painted.
  const [loadedFor, setLoadedFor] = useState(roleId);
  if (roleId !== loadedFor) {
    setLoadedFor(roleId);
    setAccess(Object.fromEntries(sections.flatMap((s) => s.rows.map((r) => [r.resource, r.access]))));
  }

  const update = (resource: string, patch: Partial<ResourceAccess>) =>
    setAccess((prev) => {
      const next = { ...prev[resource], ...patch };
      // Losing read takes the other two with it, matching what the server does
      // when it stores the row.
      if (!next.read) return { ...prev, [resource]: { read: false, write: false, visible: false } };
      return { ...prev, [resource]: next };
    });

  const setAll = (rows: Row[], patch: Partial<ResourceAccess>) =>
    setAccess((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const merged = { ...next[row.resource], ...patch };
        next[row.resource] = merged.read ? merged : { read: false, write: false, visible: false };
      }
      return next;
    });

  if (isAdministrator) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Administrator has full access
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4 text-sm text-muted-foreground">
          This role is deliberately not editable. Someone has to be able to undo a mistake, and a screen that let you
          remove your own access to the screen that grants access would be a trap rather than a feature. To restrict
          someone, give them a different role on the Users page.
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={saveAction}>
      <input type="hidden" name="roleId" value={roleId} />

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
          <div>
            <CardTitle className="text-base">What {roleName} can do</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">Read</strong> opens the page — untick it and the page is
              closed to this role. <strong className="font-medium text-foreground">Write</strong> allows changes, and
              is enforced when the change is submitted, not just by hiding buttons.{" "}
              <strong className="font-medium text-foreground">Visible</strong> only controls whether the entry appears
              in the sidebar or the Settings grid; a hidden page still opens from a bookmark or a link.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 border-t pt-4">
          {sections.map((section) => (
            <div key={section.group}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {section.group}
                </h3>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setAll(section.rows, { read: true, write: true, visible: true })}
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setAll(section.rows, { read: true, write: false, visible: true })}
                  >
                    Read only
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setAll(section.rows, { read: false })}
                  >
                    None
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Page or card</th>
                      <th className="w-24 px-3 py-2 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Read
                        </span>
                      </th>
                      <th className="w-24 px-3 py-2 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Pencil className="h-3 w-3" /> Write
                        </span>
                      </th>
                      <th className="w-24 px-3 py-2 text-center font-medium">
                        <span className="inline-flex items-center gap-1">
                          <LayoutGrid className="h-3 w-3" /> Visible
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => {
                      const a = access[row.resource] ?? row.access;
                      return (
                        <tr key={row.resource} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-1.5">
                            <span className={a.read ? "" : "text-muted-foreground line-through"}>{row.label}</span>
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {row.kind === "card" ? (
                                <span className="inline-flex items-center gap-1">
                                  <LayoutGrid className="h-2.5 w-2.5" /> card
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="h-2.5 w-2.5" /> page
                                </span>
                              )}
                            </span>
                          </td>
                          <Toggle
                            name={`read:${row.resource}`}
                            checked={a.read}
                            onChange={(v) => update(row.resource, { read: v })}
                            label={`Read ${row.label}`}
                          />
                          <Toggle
                            name={`write:${row.resource}`}
                            checked={a.write}
                            disabled={!a.read}
                            onChange={(v) => update(row.resource, { write: v })}
                            label={`Write ${row.label}`}
                          />
                          <Toggle
                            name={`visible:${row.resource}`}
                            checked={a.visible}
                            disabled={!a.read}
                            onChange={(v) => update(row.resource, { visible: v })}
                            label={`Show ${row.label} in navigation`}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <SaveBar
            state={saveState.status === "idle" ? resetState : saveState}
            label={`Save ${roleName} permissions`}
            hint="Anything left at the default — readable and visible, not writable — is stored as no row at all."
          />
        </CardContent>
      </Card>

      {/* A plain button that dispatches the reset action directly rather than
          submitting this form — nesting a second form here is invalid HTML,
          and a submit button would save the ticks instead of clearing them. */}
      <div className="mt-3 flex justify-end">
        <ResetButton roleId={roleId} roleName={roleName} action={resetAction} />
      </div>
    </form>
  );
}

function Toggle({
  name,
  checked,
  disabled,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <td className="px-3 py-1.5 text-center">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
      />
    </td>
  );
}

function ResetButton({
  roleId,
  roleName,
  action,
}: {
  roleId: string;
  roleName: string;
  action: (formData: FormData) => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      onClick={() => {
        const data = new FormData();
        data.set("roleId", roleId);
        action(data);
      }}
    >
      Reset {roleName} to defaults
    </Button>
  );
}
