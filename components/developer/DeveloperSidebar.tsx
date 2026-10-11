"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  Database,
  Download,
  FileWarning,
  LayoutDashboard,
  Map,
  Menu,
  UploadCloud,
  X,
} from "lucide-react";

const navigation = [
  {
    label: "Overview",
    href: "/developer",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Statewide Map",
    href: "/developer/map",
    icon: Map,
  },
];

const dataNavigation = [
  {
    label: "Import Jobs",
    href: "/developer/jobs",
    icon: UploadCloud,
  },
  {
    label: "All Records",
    href: "/developer/records",
    icon: Database,
  },
  {
    label: "Rejected Records",
    href: "/developer/rejected",
    icon: FileWarning,
  },
  {
    label: "Export Center",
    href: "/developer/exports",
    icon: Download,
  },
];

type DeveloperSidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export default function DeveloperSidebar({
  mobileOpen: controlledMobileOpen,
  onMobileClose,
}: DeveloperSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const isControlled = controlledMobileOpen !== undefined;
  const mobileOpen = isControlled ? controlledMobileOpen : internalMobileOpen;

  function closeMobile() {
    setInternalMobileOpen(false);
    onMobileClose?.();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderLink(
    item: (typeof navigation)[number] | (typeof dataNavigation)[number],
  ) {
    const Icon = item.icon;
    const active = isActive(item.href, "exact" in item ? item.exact : false);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobile}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`developer-sidebar-link${active ? " active" : ""}`}
      >
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
        <span className="developer-sidebar-link-label">{item.label}</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="developer-mobile-menu"
        aria-label="Open developer navigation"
        aria-expanded={mobileOpen}
        onClick={() => setInternalMobileOpen(true)}
      >
        <Menu size={20} />
        <span>Developer menu</span>
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="developer-sidebar-backdrop"
          aria-label="Close developer navigation"
          onClick={closeMobile}
        />
      )}

      <aside
        className={[
          "developer-sidebar",
          collapsed ? "is-collapsed" : "",
          mobileOpen ? "mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Developer panel navigation"
      >
        <div className="developer-sidebar-brand">
          <div className="developer-sidebar-brand-icon">
            <Activity size={20} />
          </div>

          <div className="developer-sidebar-brand-copy">
            <strong>Location Connect</strong>
            <span>DEVELOPER CONSOLE</span>
          </div>

          <button
            type="button"
            className="developer-sidebar-mobile-close"
            onClick={closeMobile}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <div className="developer-sidebar-environment">
          <span className="developer-sidebar-status-dot" />
          <span className="developer-sidebar-environment-label">
            GLOBAL CONTROL CENTER
          </span>
        </div>

        <nav className="developer-sidebar-nav">
          <div className="developer-sidebar-section-label">WORKSPACE</div>

          <div className="developer-sidebar-links">
            {navigation.map(renderLink)}
          </div>

          <div className="developer-sidebar-divider" />

          <div className="developer-sidebar-section-label">DATA MANAGEMENT</div>

          <div className="developer-sidebar-links">
            {dataNavigation.map(renderLink)}
          </div>
        </nav>

        <div className="developer-sidebar-bottom">
          <Link
            href="/"
            className="developer-sidebar-back-link"
            onClick={closeMobile}
            title={collapsed ? "District Explorer" : undefined}
          >
            <ArrowLeft size={18} />
            <span className="developer-sidebar-link-label">
              District Explorer
            </span>
          </Link>

          <button
            type="button"
            className="developer-sidebar-collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft size={17} className={collapsed ? "is-rotated" : ""} />
            <span className="developer-sidebar-link-label">
              Collapse sidebar
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
