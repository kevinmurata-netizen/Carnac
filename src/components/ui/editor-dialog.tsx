"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** The corners a dialog is resized from, by which way each one grows it. */
const CORNERS = [
  { name: "top-left", x: -1, y: -1, className: "top-0 left-0 cursor-nwse-resize" },
  { name: "top-right", x: 1, y: -1, className: "top-0 right-0 cursor-nesw-resize" },
  { name: "bottom-left", x: -1, y: 1, className: "bottom-0 left-0 cursor-nesw-resize" },
  { name: "bottom-right", x: 1, y: 1, className: "bottom-0 right-0 cursor-nwse-resize" },
] as const;

const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;
/** Room left around a dialog grown to fill the window. */
const MARGIN = 16;

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
 *
 * Any corner drags it bigger or smaller, for a wide table or a long preview.
 * It stays centred, so it grows on both sides of the corner you drag. Its
 * content scrolls inside it, and a row of buttons marked
 * `data-dialog-actions` stays pinned to the bottom while it does, so Save is
 * never scrolled out of sight.
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
  const popup = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // Each opening starts at the usual size.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSize(null);
  }

  const startResize = (corner: (typeof CORNERS)[number]) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = popup.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };

    const move = (e: PointerEvent) => {
      // Centred, so the corner keeps up with the pointer only if both sides move.
      const width = start.width + 2 * corner.x * (e.clientX - start.x);
      const height = start.height + 2 * corner.y * (e.clientY - start.y);
      setSize({
        width: Math.round(Math.min(Math.max(width, MIN_WIDTH), window.innerWidth - 2 * MARGIN)),
        height: Math.round(Math.min(Math.max(height, MIN_HEIGHT), window.innerHeight - 2 * MARGIN)),
      });
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} disablePointerDismissal>
      <DialogContent
        ref={popup}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        style={
          size
            ? { width: size.width, height: size.height, maxWidth: `calc(100vw - ${2 * MARGIN}px)`, maxHeight: "none" }
            : undefined
        }
        showCloseButton
      >
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 [&_[data-dialog-actions]]:sticky [&_[data-dialog-actions]]:-bottom-4 [&_[data-dialog-actions]]:z-10 [&_[data-dialog-actions]]:-mx-4 [&_[data-dialog-actions]]:border-t [&_[data-dialog-actions]]:bg-popover [&_[data-dialog-actions]]:px-4 [&_[data-dialog-actions]]:pt-4 [&_[data-dialog-actions]]:pb-4">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription render={<div />}>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </div>
        {CORNERS.map((corner) => (
          <div
            key={corner.name}
            aria-hidden
            title="Drag to resize"
            onPointerDown={startResize(corner)}
            className={`absolute z-20 h-4 w-4 touch-none ${corner.className}`}
          />
        ))}
        <svg
          aria-hidden
          viewBox="0 0 10 10"
          className="pointer-events-none absolute right-1 bottom-1 z-20 h-2.5 w-2.5 text-muted-foreground/70"
        >
          <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      </DialogContent>
    </Dialog>
  );
}
