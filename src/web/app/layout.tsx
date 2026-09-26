import "./globals.css";
import { Theme } from "@radix-ui/themes";
import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:8080"),
  title: { default: "Portal · Hackathon judging", template: "%s · Portal" },
  description: "Self-hosted hackathon submission and judging portal. Weighted rubrics, normalized scores, audit trail. Runs offline.",
  openGraph: { images: [{ url: "/art/og.jpg", width: 1200, height: 630 }] },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfdfc" },
    { media: "(prefers-color-scheme: dark)", color: "#111210" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets .light/.dark before first paint so there is no flash; see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Theme accentColor="lime" grayColor="olive" radius="medium" panelBackground="translucent" className="flex min-h-dvh flex-col">
          <Providers>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg"
            >
              Skip to content
            </a>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </Providers>
        </Theme>
      </body>
    </html>
  );
}
