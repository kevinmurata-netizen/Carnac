"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createUserAction, resetPasswordAction } from "../actions";
import { EMPTY_USER_STATE, type UserActionState } from "./state";
import { Check, Copy, KeyRound } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Role = { id: string; name: string };

/**
 * The one moment the plaintext password exists outside the administrator's
 * head. It is never stored — only the bcrypt hash is — so if this is dismissed
 * without being copied, the only way to recover is another reset.
 */
function CredentialPanel({ credential }: { credential: { email: string; password: string } }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-md border border-emerald-600/40 bg-emerald-600/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
        <KeyRound className="h-4 w-4" /> Password — shown once
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-background px-2 py-1 font-mono text-sm text-foreground">
          {credential.password}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(credential.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Give this to {credential.email} over something private — ideally not the same message as the site link. It is
        stored only as a hash and cannot be shown again; if it is lost, reset it rather than trying to recover it.
      </p>
    </div>
  );
}

function Result({ state }: { state: UserActionState }) {
  if (state.status === "idle") return null;
  return (
    <div className="space-y-3">
      {state.status === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.message}
        </div>
      )}
      {state.status === "success" && <p className="text-sm text-emerald-700">{state.message}</p>}
      {state.credential && <CredentialPanel credential={state.credential} />}
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function AddUserForm({ roles }: { roles: Role[] }) {
  const [state, action] = useActionState(createUserAction, EMPTY_USER_STATE);
  const [setOwnPassword, setSetOwnPassword] = useState(false);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Add a User</CardTitle>
        <p className="text-xs text-muted-foreground">
          Creates a login immediately. Leave the password blank and a strong one is generated and shown once.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <input id="new-name" name="name" required placeholder="Jane Rivera" className={input} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <input
                id="new-email"
                name="email"
                type="email"
                required
                placeholder="jane@example.com"
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role</Label>
              <select id="new-role" name="roleId" required defaultValue="" className={input}>
                <option value="" disabled>
                  Choose a role…
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={setOwnPassword}
              onChange={(e) => setSetOwnPassword(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Set the password myself instead of generating one
          </label>

          {setOwnPassword && (
            <div className="space-y-1.5 sm:max-w-sm">
              <Label htmlFor="new-password">Password</Label>
              <input
                id="new-password"
                name="password"
                type="password"
                minLength={12}
                placeholder="At least 12 characters"
                className={input}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Submit label="Create user" />
          </div>
        </form>

        <Result state={state} />
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ userId, email }: { userId: string; email: string }) {
  const [state, action] = useActionState(resetPasswordAction, EMPTY_USER_STATE);
  const [open, setOpen] = useState(false);

  if (!open && state.status === "idle") {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Reset password
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {state.status === "idle" && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <input
            name="password"
            type="password"
            minLength={12}
            placeholder="Leave blank to generate"
            className={`${input} w-52`}
            aria-label={`New password for ${email}`}
          />
          <Submit label="Reset" />
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
      <Result state={state} />
    </div>
  );
}
