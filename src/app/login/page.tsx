import { LoginForm } from "./login-form";
import { Droplets } from "lucide-react";
import { PRODUCT_TAGLINE } from "@/config/labels";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Droplets className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">CARNAC</h1>
          <p className="text-sm text-muted-foreground">{PRODUCT_TAGLINE}</p>
        </div>
        <LoginForm callbackUrl={params.callbackUrl} error={params.error} />
      </div>
    </div>
  );
}
