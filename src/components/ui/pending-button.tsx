"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useLinkStatus } from "next/link";
import { Button } from "@/components/ui/button";
import { InlineSpinner } from "@/components/ui/loading-indicator";

type Size = "xs" | "sm" | "default";
type Variant = "default" | "outline" | "ghost";

/**
 * A form's submit button that shows it is working.
 *
 * For forms whose action takes a while — creating a plan runs a whole
 * scenario first — so the button says so and cannot be pressed twice, rather
 * than looking dead until the redirect lands.
 */
export function SubmitButton({
  children,
  pendingLabel,
  size = "sm",
  variant = "default",
  title,
}: {
  children: ReactNode;
  pendingLabel: string;
  size?: Size;
  variant?: Variant;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending} title={title} aria-busy={pending}>
      {pending ? (
        <>
          <InlineSpinner className="mr-1" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function LinkLabel({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <InlineSpinner className="mr-1" />
      {pendingLabel}
    </>
  ) : (
    <>{children}</>
  );
}

/**
 * A button-styled link that shows it is working.
 *
 * For a link back to the same page with a different query — Run this plan —
 * where no loading screen appears because the route itself does not change,
 * so the only place to say "working" is the button that was pressed.
 */
export function PendingLinkButton({
  href,
  children,
  pendingLabel,
  size = "sm",
  variant = "default",
}: {
  href: string;
  children: ReactNode;
  pendingLabel: string;
  size?: Size;
  variant?: Variant;
}) {
  return (
    <Button
      size={size}
      variant={variant}
      nativeButton={false}
      render={
        <Link href={href} prefetch={false}>
          <LinkLabel pendingLabel={pendingLabel}>{children}</LinkLabel>
        </Link>
      }
    />
  );
}
