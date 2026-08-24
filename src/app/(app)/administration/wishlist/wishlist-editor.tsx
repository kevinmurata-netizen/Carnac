"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { WishlistRow } from "@/server/wishlist";
import {
  addWishlistItemAction,
  saveWishlistItemAction,
  toggleWishlistDoneAction,
  removeWishlistItemAction,
} from "./actions";
import { EMPTY_WISHLIST_STATE } from "./state";
import { Pencil, Plus, Trash2, X } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textarea =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  HIGH: "destructive",
  MEDIUM: "default",
  LOW: "secondary",
};

const PRIORITY_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function PrioritySelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={input} aria-label="Priority">
      <option value="HIGH">High</option>
      <option value="MEDIUM">Medium</option>
      <option value="LOW">Low</option>
    </select>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function AddForm() {
  const [state, action] = useActionState(addWishlistItemAction, EMPTY_WISHLIST_STATE);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Add an Item</CardTitle>
      </CardHeader>
      <CardContent>
        {/* key resets the fields after a successful add, so the form is ready
            for the next one instead of holding what was just submitted. */}
        <form key={state.status === "success" ? state.message ?? "" : "form"} action={action} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="wl-title">What would you like?</Label>
              <input
                id="wl-title"
                name="title"
                required
                maxLength={200}
                placeholder="e.g. Export the work plan to Excel"
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-priority">Priority</Label>
              <PrioritySelect name="priority" defaultValue="MEDIUM" />
            </div>
          </div>

          {showDetail ? (
            <div className="space-y-1.5">
              <Label htmlFor="wl-description">Details (optional)</Label>
              <textarea id="wl-description" name="description" rows={3} className={textarea} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetail(true)}
              className="text-xs text-primary hover:underline"
            >
              + Add details
            </button>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs">
              {state.status === "error" && <span className="text-destructive">{state.message}</span>}
              {state.status === "success" && <span className="text-emerald-600">{state.message}</span>}
            </span>
            <Submit label="Add" />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ item }: { item: WishlistRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(saveWishlistItemAction, EMPTY_WISHLIST_STATE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not do that");
      }
    });

  if (editing) {
    return (
      <li className="rounded-md border p-3">
        <form
          action={action}
          onSubmit={() => setEditing(false)}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={item.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor={`t-${item.id}`}>Item</Label>
              <input id={`t-${item.id}`} name="title" defaultValue={item.title} required className={input} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`p-${item.id}`}>Priority</Label>
              <PrioritySelect name="priority" defaultValue={item.priority} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`d-${item.id}`}>Details (optional)</Label>
            <textarea
              id={`d-${item.id}`}
              name="description"
              rows={3}
              defaultValue={item.description ?? ""}
              className={textarea}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-destructive">{state.status === "error" ? state.message : ""}</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
              <Submit label="Save" />
            </div>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`flex items-start gap-3 rounded-md border p-3 ${item.isDone ? "bg-muted/40" : ""}`}>
      <input
        type="checkbox"
        checked={item.isDone}
        disabled={pending}
        onChange={() => run(() => toggleWishlistDoneAction(item.id, !item.isDone))}
        aria-label={item.isDone ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />

      <div className="min-w-0 flex-1">
        <div className={`text-sm ${item.isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {item.title}
        </div>
        {item.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant={PRIORITY_VARIANT[item.priority]} className="text-[10px]">
            {PRIORITY_LABEL[item.priority]}
          </Badge>
          {item.createdByName && <span>added by {item.createdByName}</span>}
          <span>{item.createdAt.toLocaleDateString("en-US")}</span>
          {error && <span className="text-destructive">{error}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${item.title}`}>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => removeWishlistItemAction(item.id))}
          aria-label={`Remove ${item.title}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </li>
  );
}

export function WishlistEditor({ items }: { items: WishlistRow[] }) {
  const open = items.filter((i) => !i.isDone);
  const done = items.filter((i) => i.isDone);

  return (
    <>
      <AddForm />

      <Card>
        <CardHeader>
          <CardTitle>
            Open <span className="text-sm font-normal text-muted-foreground">({open.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              <Plus className="mx-auto mb-2 h-5 w-5" />
              Nothing on the list yet. Add the first item above.
            </div>
          ) : (
            <ul className="space-y-2">
              {open.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              Done <span className="text-sm font-normal text-muted-foreground">({done.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {done.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
