import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MapPinned } from "lucide-react";

export const metadata: Metadata = {
  title: "Location Connect | West Bengal District Explorer",
  description:
    "Explore West Bengal's 23 districts through Location Connect, a geographic exploration and location data platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link className="brand brand-new" href="/">
            <span className="brand-symbol">
              <MapPinned size={21} strokeWidth={2} />
            </span>

            <span className="brand-copy">
              <strong>
                location<span>connect</span>
              </strong>
              <small>WEST BENGAL</small>
            </span>
          </Link>

          {/* <nav className="nav nav-new">
            <Link className="nav-active" href="/">
              Districts
            </Link>

            <Link href="/map">Map explorer</Link>

            <Link href="/records">Records</Link>

            <Link href="/upload" className="nav-upload">
              Data management
              <ArrowUpRight size={15} />
            </Link>
          </nav> */}
        </header>

        {children}
      </body>
    </html>
  );
}
