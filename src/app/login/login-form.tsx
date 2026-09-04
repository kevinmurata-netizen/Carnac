"use client";

import { useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

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

/**
 * The remembered email, read as browser state rather than React state.
 *
 * localStorage does not exist on the server, so seeding a field from it during
 * render would make the server and client markup disagree. useSyncExternalStore
 * is how the sidebar already reads its own stored preference here: the server
 * snapshot is "nothing remembered", the client's is whatever is stored, and
 * React reconciles the two without a hydration warning.
 */
let cachedEmail: string | null | undefined;

function subscribeToStorage(onChange: () => void) {
  // Another tab signing in or out should be reflected here too.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getRememberedEmail(): string | null {
  if (cachedEmail === undefined) {
    try {
      cachedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    } catch {
      // Private browsing can refuse storage; signing in still works.
      cachedEmail = null;
    }
  }
  return cachedEmail;
}

/** Nothing is remembered as far as the server is concerned. */
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

export function LoginForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const remembered = useSyncExternalStore(
    subscribeToStorage,
    getRememberedEmail,
    getRememberedEmailOnServer
  );

  // Remounted when the remembered value arrives, so the field and the checkbox
  // take it as their initial value. Setting them from an effect instead would
  // mean writing state during render's aftermath for something that is really
  // just a different starting point.
  return (
    <LoginFields
      key={remembered ?? "nothing-remembered"}
      rememberedEmail={remembered}
      callbackUrl={callbackUrl}
      error={error}
    />
  );
}

function LoginFields({
  rememberedEmail,
  callbackUrl,
  error,
}: {
  rememberedEmail: string | null;
  callbackUrl?: string;
  error?: string;
}) {
  const [submitError, setSubmitError] = useState<string | null>(
    error ? ERROR_MESSAGES[error] ?? "Sign in failed." : null
  );
  const [remember, setRemember] = useState(rememberedEmail !== null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: rememberedEmail ?? "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });

    if (result?.error) {
      setSubmitError(ERROR_MESSAGES[result.error] ?? "Sign in failed.");
      return;
    }

    writeRememberedEmail(remember ? values.email : null);

    // A whole-document navigation rather than a client-side route change.
    // Password managers decide whether to offer "save this password" by
    // watching for a navigation after a password field is submitted; a soft
    // navigation is invisible to that, which is why the browser never asked.
    window.location.assign(callbackUrl || "/dashboard");
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Enter in a text field should submit, but the Base UI Input wrapper
            does not reliably produce the browser's implicit submission. This
            submits explicitly instead.

            Capture phase on purpose: it runs before any handler inside the
            input could stop propagation. preventDefault also means that if
            implicit submission *does* work in a given browser, it is cancelled
            here rather than firing a second time. Activating the Sign in button
            by keyboard is left alone — that is a click, not an INPUT. */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          onKeyDownCapture={(e) => {
            if (e.key !== "Enter" || isSubmitting) return;
            if ((e.target as HTMLElement).tagName !== "INPUT") return;
            e.preventDefault();
            void handleSubmit(onSubmit)();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            {/* "username", not "email": it is the token password managers pair
                with current-password to recognise a sign-in form. "email" on
                its own reads as a contact field and is filled less reliably. */}
            <Input id="email" type="email" autoComplete="username" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
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

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
