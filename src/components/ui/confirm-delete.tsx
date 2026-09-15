"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A delete button that asks first.
 *
 * Every delete in the application goes through this, so "are you sure" is
 * asked the same way everywhere: a dialog naming the thing and saying what
 * happens, with keyboard focus starting on Cancel so a stray Enter backs out
 * rather than deletes.
 *
 * It works in both shapes a delete takes here, which is why it is one
 * component and not two:
 *
 *  - **Inside a form** whose action does the deleting — including server
 *    components, which cannot pass a callback. Leave `onConfirm` off and
 *    confirming submits the form the button sits in, exactly as the plain
 *    submit button it replaces did. Pending state comes from that form.
 *
 *  - **With `onConfirm`**, for client code that calls an action directly.
 *
 * The button is `type="button"` in both: a delete must never be reachable by
 * submitting the form some other way, which is the whole point of asking.
 */
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
  children,
  pendingLabel,
  variant = "destructive",
  size = "sm",
  disabled,
  className,
  triggerTitle,
  ariaLabel,
}: {
  /** "Delete Coating?" — names the thing, as a question. */
  title: string;
  /** What deleting it does, especially anything that cannot be undone or
   * anything else it takes with it. */
  description: ReactNode;
  /** Omit to submit the enclosing form instead. */
  onConfirm?: () => void;
  confirmLabel?: string;
  /** The trigger button's content. */
  children: ReactNode;
  /** Shown on the trigger while the enclosing form is submitting. */
  pendingLabel?: ReactNode;
  variant?: "destructive" | "ghost" | "outline";
  size?: "xs" | "sm" | "default" | "icon-sm" | "icon-xs";
  disabled?: boolean;
  className?: string;
  /** Tooltip on the trigger, e.g. why it is disabled. */
  triggerTitle?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  // Reports false outside a form, which is right: an onConfirm delete tracks
  // its own pending state in whoever passed the callback.
  const { pending } = useFormStatus();

  const confirm = () => {
    setOpen(false);
    if (onConfirm) onConfirm();
    else form.current?.requestSubmit();
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        className={className}
        title={triggerTitle}
        aria-label={ariaLabel}
        onClick={(e) => {
          // Captured at the moment of the click: the button knows its form,
          // and the dialog that confirms is portalled outside it.
          form.current = (e.currentTarget as HTMLButtonElement).form;
          setOpen(true);
        }}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} initialFocus={cancel}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription render={<div />}>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={cancel} type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirm}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
