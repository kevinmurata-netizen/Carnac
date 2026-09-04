"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_SETTINGS_STATE, type SettingsActionState } from "@/app/(app)/settings/state";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

export type RoleSummary = {
  id: string;
  name: string;
  code: string;
  isSystem: boolean;
  userCount: number;
};

type Action = (prev: SettingsActionState, form: FormData) => Promise<SettingsActionState>;

/**
 * Naming roles: create one, rename one, remove one that was a mistake.
 *
 * Renaming is safe for every role including Administrator, because nothing in
 * the application decides anything from a role's name — each role carries a
 * fixed code for that. The built-in four can still not be *deleted*, since an
 * organization with no Administrator role has no way back in.
 */
export function RoleManager({
  role,
  roles,
  create,
  rename,
  remove,
}: {
  role: RoleSummary;
  roles: RoleSummary[];
  create: Action;
  rename: Action;
  remove: Action;
}) {
  const [mode, setMode] = useState<"idle" | "rename" | "create" | "confirm-delete">("idle");
  const [createState, createAction] = useActionState(create, EMPTY_SETTINGS_STATE);
  const [renameState, renameAction] = useActionState(rename, EMPTY_SETTINGS_STATE);
  const [deleteState, deleteAction] = useActionState(remove, EMPTY_SETTINGS_STATE);

  // Switching roles closes whatever was open, so a rename box never carries
  // the previous role's name into this one.
  const [loadedFor, setLoadedFor] = useState(role.id);
  if (role.id !== loadedFor) {
    setLoadedFor(role.id);
    setMode("idle");
  }

  const error = [createState, renameState, deleteState].find((s) => s.status === "error");
  const success = [createState, renameState].find((s) => s.status === "success");

  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 py-4">
        {mode === "idle" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("rename")}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Rename {role.name}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("create")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New role
            </Button>
            {!role.isSystem && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setMode("confirm-delete")}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            {role.isSystem && (
              <span className="text-xs text-muted-foreground">
                Built-in role — it can be renamed, but not deleted.
              </span>
            )}
          </div>
        )}

        {mode === "rename" && (
          <form action={renameAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="roleId" value={role.id} />
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                What this role is called
              </span>
              <input
                name="name"
                defaultValue={role.name}
                autoFocus
                maxLength={40}
                aria-label="Role name"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <Button type="submit" size="sm">
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Save name
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}

        {mode === "create" && (
          <form action={createAction} className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Name the new role</span>
                <input
                  name="name"
                  autoFocus
                  maxLength={40}
                  placeholder="Field Supervisor"
                  aria-label="New role name"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Start from</span>
                <select
                  name="copyFromRoleId"
                  defaultValue=""
                  aria-label="Copy permissions from"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">The defaults</option>
                  {roles
                    .filter((r) => r.code !== "ADMINISTRATOR")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        A copy of {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create role
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A new role starts able to read everything and change nothing outside the operational pages. Copying an
              existing role brings across exactly what that role can reach today.
            </p>
          </form>
        )}

        {mode === "confirm-delete" && (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="roleId" value={role.id} />
            <span className="text-sm">
              Delete <strong className="font-medium">{role.name}</strong>
              {role.userCount > 0
                ? ` — it still has ${role.userCount} ${role.userCount === 1 ? "person" : "people"} assigned.`
                : " and its permissions?"}
            </span>
            <Button type="submit" size="sm" variant="destructive">
              Delete role
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Keep it
            </Button>
          </form>
        )}

        {error && <p className="text-xs text-destructive">{error.message}</p>}
        {!error && success && <p className="text-xs text-emerald-600">{success.message}</p>}
      </CardContent>
    </Card>
  );
}
