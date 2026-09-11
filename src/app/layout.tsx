import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AuthGate } from "@/components/auth-gate";

export const metadata: Metadata = {
  title: "MyLifeSense",
  description: "Understand what drives the patterns in your life.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f1ea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <StoreProvider>
          <div className="mx-auto min-h-screen w-full max-w-2xl bg-ground">
            <AuthGate>{children}</AuthGate>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
