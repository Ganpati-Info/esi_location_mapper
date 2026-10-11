import "./globals.css";
import "leaflet/dist/leaflet.css";

import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Location Connect | West Bengal",
  description:
    "Explore district-wise location data, plotting coverage, and address intelligence across West Bengal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <div className="app-loading">
              Loading Location Connect...
            </div>
          }
        >
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}