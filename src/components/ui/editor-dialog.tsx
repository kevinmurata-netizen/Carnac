"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A full editor, opened over the page you were on.
 *
 * For editing something shared — a rule, an effect — from inside the thing
 * that uses it. Opening the shared item's own page meant leaving the treatment
 * you were working on, with the browser's back button as the only way home.
 * Here the treatment never goes away: close the editor and you are exactly
 * where you were.
 *
 * Clicking outside does not close it. An editor holds typing, and a stray
 * click beside the dialog is the easiest way to lose it; the editor's own
 * Cancel and Save buttons are how it closes.
 */
export function EditorDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} disablePointerDismissal>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription render={<div />}>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
