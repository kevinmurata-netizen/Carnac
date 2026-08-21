"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function LoginForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(
    error ? ERROR_MESSAGES[error] ?? "Sign in failed." : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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

    router.push(callbackUrl || "/dashboard");
    router.refresh();
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
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
