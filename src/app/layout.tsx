import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@next/third-parties/google";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import ClientInitialization from "@/components/ClientInitialization";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Money OS - Your Financial Operating System",
  description: "Secure, encrypted, and designed-for-purpose financial command center for modern teams.",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      "msvalidate.01": "F614BC6EF94226D68CEEFCFD3ED65C36",
    },
  },
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
        <ClientInitialization />
        <PostHogProvider>{children}</PostHogProvider>
        <GoogleAnalytics gaId="G-JZ0LD0YTJE" />
      </body>
    </html>
  );
}
