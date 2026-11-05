import { LoginForm } from "./login-form";
import { BrandLogo, BrandName } from "@/components/layout/brand-logo";
import { getDeploymentBranding } from "@/server/branding";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Nobody is signed in yet, so this is the deployment's branding.
  const branding = await getDeploymentBranding();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BrandLogo logo={branding.logo} className="h-6 w-6" />
          </div>
          <h1>
            <BrandName name={branding.productName} className="text-2xl" />
          </h1>
          <p className="text-sm text-muted-foreground">{branding.tagline}</p>
        </div>
        <LoginForm callbackUrl={params.callbackUrl} error={params.error} />
      </div>
    </div>
  );
}
