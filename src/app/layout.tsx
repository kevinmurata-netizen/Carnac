import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PRODUCT_TAGLINE } from "@/config/labels";
import { ThemeScript } from "@/components/layout/theme-script";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `CARNAC | ${PRODUCT_TAGLINE}`,
  description: "Water management & decision support platform",
};

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
