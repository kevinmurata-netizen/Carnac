"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, LockOpen } from "lucide-react";

export type EditState = { status: "idle" | "success" | "error"; message?: string };

export type EditableField = {
  /** Form field name. Fields are only submitted while unlocked, so a locked
   * record cannot be changed by a stray submit. */
  name: string;
  label: string;
  /** What to show when locked — already formatted, units and all. */
  display: string;
  /** What to put in the input when unlocked. */
  value: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "boolean";
  options?: Array<{ value: string; label: string }>;
  step?: string;
  /** Fields the record owns but this form must not change. */
  readOnly?: boolean;
};

export type EditableSection = { title: string; fields: EditableField[]; columns?: number };

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A record's fields, read-only until unlocked.
 *
 * The lock is the point: these pages are read far more often than they are
 * edited, so editing is something you opt into rather than something you can
 * do by clicking in the wrong place. Locking again discards whatever was typed
 * and re-renders from the saved values — the inputs are keyed on the lock
 * state, so there is no half-edited state left behind.
 */
export function RecordEditor({
  sections,
  action,
  hiddenFields,
  canEdit,
  lockedNote,
}: {
  sections: EditableSection[];
  action: (prev: EditState, formData: FormData) => Promise<EditState>;
  /** Ids and the like the action needs, always submitted. */
  hiddenFields: Record<string, string>;
  canEdit: boolean;
  /** Why editing is unavailable, when it is. */
  lockedNote?: string;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } as EditState);
  const [unlocked, setUnlocked] = useState(false);
  const [seen, setSeen] = useState(state);

  // A successful save returns the record to its locked, read-only state, so
  // the page you are left looking at is the one that was actually stored.
  // Adjusted during render rather than in an effect: React discards this pass
  // and re-renders immediately, so the unlocked form is never painted.
  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setUnlocked(false);
  }

  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          {unlocked ? (
            <LockOpen className="h-4 w-4 text-primary" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={unlocked ? "font-medium text-foreground" : "text-muted-foreground"}>
            {unlocked ? "Editing — fields are unlocked" : "Locked — fields are read-only"}
          </span>
          {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
          {state.status === "success" && !unlocked && (
            <span className="text-xs text-emerald-600">{state.message}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={unlocked ? "outline" : "secondary"}
                onClick={() => setUnlocked((v) => !v)}
              >
                {unlocked ? "Cancel" : "Unlock to edit"}
              </Button>
              {unlocked && <SaveButton />}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{lockedNote ?? "Your role cannot edit this record"}</span>
          )}
        </div>
      </div>

      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent
            className={`grid grid-cols-2 gap-x-6 gap-y-4 ${
              section.columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
            }`}
          >
            {section.fields.map((field) => (
              <FieldCell key={field.name} field={field} unlocked={unlocked} />
            ))}
          </CardContent>
        </Card>
      ))}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function FieldCell({ field, unlocked }: { field: EditableField; unlocked: boolean }) {
  const editing = unlocked && !field.readOnly;

  return (
    <div className={field.type === "textarea" ? "col-span-2 sm:col-span-3" : undefined}>
      <label
        htmlFor={editing ? field.name : undefined}
        className="text-xs font-medium text-muted-foreground"
      >
        {field.label}
      </label>

      {!editing ? (
        <p className="mt-0.5 text-sm font-medium text-foreground">{field.display || "—"}</p>
      ) : (
        // Keyed on the lock so cancelling an edit re-mounts the input with the
        // saved value rather than keeping whatever was typed.
        <div className="mt-1" key={`${field.name}-unlocked`}>
          <Input field={field} />
        </div>
      )}
    </div>
  );
}

function Input({ field }: { field: EditableField }) {
  if (field.type === "select") {
    return (
      <select id={field.name} name={field.name} defaultValue={field.value} className={control}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <select id={field.name} name={field.name} defaultValue={field.value} className={control}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        id={field.name}
        name={field.name}
        defaultValue={field.value}
        rows={3}
        className={`${control} h-auto py-2`}
      />
    );
  }

  return (
    <input
      id={field.name}
      name={field.name}
      type={field.type ?? "text"}
      step={field.step}
      defaultValue={field.value}
      className={control}
    />
  );
}
