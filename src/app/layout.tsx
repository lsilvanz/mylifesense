import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AuthGate } from "@/components/auth-gate";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mylifesense.app"),
  title: "MyLifeSense",
  description: "Understand what drives the patterns in your life.",
  applicationName: "MyLifeSense",
  manifest: "/app/manifest.webmanifest",
  icons: {
    icon: "/app/icon.png",
    apple: "/app/icon-512.png",
  },
  appleWebApp: { capable: true, title: "MyLifeSense", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c6ce4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <StoreProvider>
          <div className="mx-auto min-h-screen w-full max-w-2xl">
            <AuthGate>{children}</AuthGate>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
