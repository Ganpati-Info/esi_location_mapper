"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  ArrowUpRight,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Upload,
  Code2,
} from "lucide-react";

import { districtHref, resolveDistrict } from "@/lib/districts";

import type { ReactNode } from "react";

const SHOW_IMPORT_DATA_BUTTON =
  process.env.NEXT_PUBLIC_SHOW_IMPORT_DATA_BUTTON !== "false";

const navigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/map",
    label: "Map explorer",
    icon: MapPinned,
  },
  {
    href: "/records",
    label: "Location records",
    icon: ClipboardList,
  },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const district = resolveDistrict(searchParams.get("district"));

  // Public district explorer: no workspace sidebar.
  const isHome = pathname === "/";
  const isDistrictExplorer = pathname === "/districts";
  const isExplorerPage = isHome || isDistrictExplorer;

  // Developer Panel is a separate, global workspace.
  // It must never require a selected district.
  const isDeveloperPage =
    pathname === "/developer" || pathname.startsWith("/developer/");

  const isUploadPage = pathname === "/upload";

  // Only district-specific pages require a selected district.
  const requiresDistrict = !isExplorerPage && !isUploadPage && !isDeveloperPage;

  // Show the district sidebar only for a valid selected district.
  const showWorkspace =
    !isExplorerPage && !isDeveloperPage && !isUploadPage && district !== null;

  const importHref = district ? districtHref("/upload", district) : "/upload";

  const dashboardHref = district ? districtHref("/dashboard", district) : "/";

  function getNavigationHref(path: string): string {
    if (!district) {
      return "/";
    }

    return districtHref(path, district);
  }

  function isNavigationActive(path: string): boolean {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <>
      <header className="app-header">
        <Link
          href="/"
          className="app-brand"
          aria-label="Location Connect homepage"
        >
          <span className="app-brand-icon">
            <MapPinned size={23} />
          </span>

          <span className="app-brand-copy">
            <strong>
              Location <span className="brand-connect">Connect</span>
            </strong>

            <small>WEST BENGAL · ADDRESS INTELLIGENCE</small>
          </span>
        </Link>

        <nav className="app-header-actions" aria-label="Application actions">
          <Link
            href="/developer"
            className={`header-developer-link ${
              isDeveloperPage ? "header-developer-link-active" : ""
            }`}
            title="Open global developer workspace"
            aria-current={isDeveloperPage ? "page" : undefined}
          >
            <Code2 size={16} />
            <span>Developer Panel</span>
            <ArrowUpRight size={15} />
          </Link>

          {showWorkspace && district ? (
            <>
              <Link href={dashboardHref} className="header-link">
                Workspace
              </Link>

              <span className="selected-district-chip">
                <MapPinned size={14} />
                {district}
              </span>
            </>
          ) : (
            <span className="header-context">
              {isDeveloperPage
                ? "GLOBAL DATA · WEST BENGAL"
                : "WEST BENGAL · 23 DISTRICTS"}
            </span>
          )}

          {SHOW_IMPORT_DATA_BUTTON && (
            <Link href={importHref} className="header-primary">
              <Upload size={16} />
              Import data
              <ArrowUpRight size={15} />
            </Link>
          )}
        </nav>
      </header>

      {/* District Explorer: no sidebar */}
      {isExplorerPage ? (
        <main className="home-main">{children}</main>
      ) : isDeveloperPage ? (
        /*
         * Developer Panel: render the global page directly.
         * No selected district or district sidebar is required.
         */
        <main className="app-main developer-main">{children}</main>
      ) : showWorkspace && district ? (
        /* District workspace: selected-district sidebar and content */
        <div className="app-layout">
          <aside className="app-sidebar">
            <div className="sidebar-selected-district">
              <span className="sidebar-section-label">SELECTED DISTRICT</span>

              <strong>{district}</strong>

              <Link href="/" className="change-district-link">
                Change district
              </Link>
            </div>

            <div className="sidebar-section-label">WORKSPACE</div>

            <nav
              className="sidebar-nav"
              aria-label={`${district} workspace navigation`}
            >
              {navigation.map(({ href, label, icon: Icon }) => {
                const active = isNavigationActive(href);

                return (
                  <Link
                    key={href}
                    href={getNavigationHref(href)}
                    className={`sidebar-link ${
                      active ? "sidebar-link-active" : ""
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{label}</span>
                  </Link>
                );
              })}

              {SHOW_IMPORT_DATA_BUTTON && (
                <Link
                  href={getNavigationHref("/upload")}
                  className={`sidebar-link ${
                    isNavigationActive("/upload") ? "sidebar-link-active" : ""
                  }`}
                  aria-current={
                    isNavigationActive("/upload") ? "page" : undefined
                  }
                >
                  <Upload size={18} strokeWidth={1.8} />
                  <span>Import data</span>
                </Link>
              )}
            </nav>

            {/* <div className="sidebar-bottom">
              <div className="sidebar-help-icon">
                <ShieldCheck size={19} />
              </div>

              <div>
                <strong>Data quality matters</strong>

                <p>
                  Estimated coordinates remain identified as estimates until
                  they are verified.
                </p>

                <Link href={getNavigationHref("/rejected")}>
                  View rejected entries →
                </Link>
              </div>
            </div> */}
          </aside>

          <main className="app-main">{children}</main>
        </div>
      ) : isUploadPage ? (
        /*
         * Uploads can be opened without a district.
         * District-specific context is preserved in the URL when present.
         */
        <main className="app-main">{children}</main>
      ) : requiresDistrict ? (
        /* District-only routes need a selected district. */
        <main className="district-required-page">
          <div className="district-required-card">
            <span className="app-brand-icon">
              <MapPinned size={23} />
            </span>

            <h1>Select a district first</h1>

            <p>
              Choose a West Bengal district to open its dashboard, map, and
              records.
            </p>

            <Link href="/" className="button button-primary">
              Explore districts
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </main>
      ) : (
        <main className="app-main">{children}</main>
      )}
    </>
  );
}
