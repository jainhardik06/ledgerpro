import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@next/third-parties/google";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import ClientInitialization from "@/components/ClientInitialization";
import { PwaProvider } from "@/components/pwa-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Required so relative OG/Twitter image paths resolve to absolute URLs
  // site-wide. Per-page canonical tags are set individually via each page's
  // own `alternates.canonical` — a blanket canonical here would incorrectly
  // claim the homepage as canonical for every other page on the site.
  metadataBase: new URL("https://moneyos.webasthetic.in"),
  title: "Money OS - Your Financial Operating System",
  description: "Secure, encrypted, and designed-for-purpose financial command center for modern teams.",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      "msvalidate.01": "F614BC6EF94226D68CEEFCFD3ED65C36",
    },
  },
  appleWebApp: {
    title: "LedgerPro",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaProvider>
          <ClientInitialization />
          <PostHogProvider>{children}</PostHogProvider>
          <GoogleAnalytics gaId="G-JZ0LD0YTJE" />
        </PwaProvider>
      </body>
    </html>
  );
}
