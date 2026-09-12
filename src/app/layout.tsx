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
  title: "MyLifeSense",
  description: "Understand what drives the patterns in your life.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e9e8fb",
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
