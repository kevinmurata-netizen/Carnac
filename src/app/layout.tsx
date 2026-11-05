import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { getDeploymentBranding } from "@/server/branding";
import { ThemeScript } from "@/components/layout/theme-script";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The product's name only (see BrandName); everything else stays in Geist. */
const orbitron = Orbitron({
  variable: "--font-brand",
  subsets: ["latin"],
});

/** The browser tab before anyone has signed in; the app's own layout uses the
 * signed-in organization's branding after that. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getDeploymentBranding();
  return {
    title: `${branding.productName} | ${branding.tagline}`,
    description: "Asset management and decision support",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  // ThemeScript sets the `dark` class before React hydrates, so the client's
  // className legitimately differs from the server's. That is the point — the
  // alternative is rendering light and then snapping to dark — so the mismatch
  // is declared rather than left as a warning that trains people to ignore
  // warnings.
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
