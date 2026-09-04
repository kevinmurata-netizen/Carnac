"use client";

import { useState, useSyncExternalStore } from "react";
import { getCsrfToken } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
};

/**
 * Only ever the email address, and only on this device.
 *
 * The password is deliberately not stored here or anywhere else this code
 * controls. Remembering a password is the browser's password manager's job:
 * it can encrypt against the operating system's keychain and gate a fill
 * behind the device unlock, none of which a value in localStorage can do.
 */
const REMEMBERED_EMAIL_KEY = "carnac.login.email";

// --- remembered email, read as browser state ------------------------------
// localStorage does not exist on the server, so seeding a field from it during
// render would make the server and client markup disagree. useSyncExternalStore
// is how the sidebar already reads its own stored preference here.

let cachedEmail: string | null | undefined;

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getRememberedEmail(): string | null {
  if (cachedEmail === undefined) {
    try {
      cachedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    } catch {
      cachedEmail = null;
    }
  }
  return cachedEmail;
}

function getRememberedEmailOnServer(): string | null {
  return null;
}

function writeRememberedEmail(email: string | null) {
  cachedEmail = email;
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Storage refused. Nothing here is required for signing in.
  }
}

// --- the CSRF token, fetched once -----------------------------------------
// Posting straight to Auth.js's callback needs the token that matches the
// cookie, and fetching it is what sets that cookie in the first place. Read
// through the same external-store pattern so it never becomes state written
// from an effect.

let csrfToken: string | null = null;
let csrfStarted = false;
const csrfListeners = new Set<() => void>();

function subscribeToCsrf(onChange: () => void) {
  csrfListeners.add(onChange);
  if (!csrfStarted) {
    csrfStarted = true;
    getCsrfToken()
      .then((token) => {
        csrfToken = token ?? null;
      })
      .catch(() => {
        csrfToken = null;
      })
      .finally(() => csrfListeners.forEach((l) => l()));
  }
  return () => csrfListeners.delete(onChange);
}

function getCsrf(): string | null {
  return csrfToken;
}

function getCsrfOnServer(): string | null {
  return null;
}

/**
 * A real form POST to Auth.js's credentials callback.
 *
 * Not a fetch. Password managers decide whether to offer "save this password"
 * by watching for a navigating form submission, and a sign-in done over fetch
 * — however carefully it navigates afterwards — is something they have to
 * infer rather than observe. This is the flow they were built around, and the
 * one Auth.js's own sign-in page uses.
 *
 * The cost is that a wrong password comes back as a redirect carrying
 * ?error=, rather than as inline state. This page already read that
 * parameter, which suggests it was the original intent.
 */
export function LoginForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const remembered = useSyncExternalStore(
    subscribeToStorage,
    getRememberedEmail,
    getRememberedEmailOnServer
  );
  const csrf = useSyncExternalStore(subscribeToCsrf, getCsrf, getCsrfOnServer);

  return (
    <LoginFields
      key={remembered ?? "nothing-remembered"}
      rememberedEmail={remembered}
      csrf={csrf}
      callbackUrl={callbackUrl}
      error={error}
    />
  );
}

function LoginFields({
  rememberedEmail,
  csrf,
  callbackUrl,
  error,
}: {
  rememberedEmail: string | null;
  csrf: string | null;
  callbackUrl?: string;
  error?: string;
}) {
  const [remember, setRemember] = useState(rememberedEmail !== null);
  const [email, setEmail] = useState(rememberedEmail ?? "");

  const message = error ? (ERROR_MESSAGES[error] ?? "Sign in failed.") : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          method="POST"
          action="/api/auth/callback/credentials"
          onSubmit={() => {
            // Written before the browser navigates away, since after a real
            // submission this code no longer runs.
            writeRememberedEmail(remember ? email.trim() : null);
          }}
          onKeyDownCapture={(e) => {
            // The Base UI Input wrapper does not reliably produce the
            // browser's implicit submission. requestSubmit rather than a
            // programmatic handler: it runs native validation and submits the
            // form for real, which is the whole point of this page.
            if (e.key !== "Enter") return;
            if ((e.target as HTMLElement).tagName !== "INPUT") return;
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }}
          className="space-y-4"
        >
          <input type="hidden" name="csrfToken" value={csrf ?? ""} />
          <input type="hidden" name="callbackUrl" value={callbackUrl || "/dashboard"} />

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            {/* "username", not "email": it is the token password managers pair
                with current-password to recognise a sign-in form. */}
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              Remember my email on this device
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Your password is never stored here — let your browser offer to save it, so it can keep it behind your
                device&apos;s own lock.
              </span>
            </span>
          </label>

          {message && <p className="text-sm text-destructive">{message}</p>}

          {/* Disabled until the token has arrived: submitting without it would
              be rejected as a forgery and look like a wrong password. */}
          <Button type="submit" className="w-full" disabled={!csrf}>
            {csrf ? "Sign in" : "Preparing…"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
