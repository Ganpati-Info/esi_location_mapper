import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSearch,
  MapPinned,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react";

import { db } from "@/lib/db";
import { districtHref, resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardStats = {
  total: number;
  mapped: number;
  review: number;
  unresolved: number;
  rejected: number;
};

type DashboardPageProps = {
  searchParams: Promise<{
    district?: string | string[];
  }>;
};

const EMPTY_STATS: DashboardStats = {
  total: 0,
  mapped: 0,
  review: 0,
  unresolved: 0,
  rejected: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function getPercentage(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function DistrictDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;

  const districtParam = Array.isArray(params.district)
    ? params.district[0]
    : params.district;

  const district = resolveDistrict(districtParam);

  if (!district) {
    return (
      <main className="workspace-page">
        <section className="panel">
          <div className="eyebrow">
            <AlertCircle size={15} />
            DISTRICT REQUIRED
          </div>

          <h1>Select a district</h1>

          <p>
            Choose a West Bengal district from the district explorer to open its
            dashboard.
          </p>

          <Link href="/" className="button button-primary">
            Explore districts
            <ArrowRight size={16} />
          </Link>
        </section>
      </main>
    );
  }

  let stats = EMPTY_STATS;
  let databaseError = false;

  try {
    if (!db) {
      throw new Error("PostgreSQL is not configured.");
    }

    /*
     * Every statistic is scoped to the selected district and West Bengal.
     * This query returns one aggregate row, not the underlying records.
     */
    const result = await db.query<{
      total: string;
      mapped: string;
      review: string;
      unresolved: string;
      rejected: string;
    }>(
      `
        SELECT
          COUNT(*)::text AS total,

          COUNT(*) FILTER (
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
          )::text AS mapped,

          COUNT(*) FILTER (
            WHERE LOWER(BTRIM(COALESCE(status, ''))) = 'review'
          )::text AS review,

          COUNT(*) FILTER (
            WHERE latitude IS NULL
               OR longitude IS NULL
          )::text AS unresolved,

          COUNT(*) FILTER (
            WHERE LOWER(BTRIM(COALESCE(status, ''))) = 'rejected'
          )::text AS rejected

        FROM location_records

        WHERE district = $1
          AND LOWER(BTRIM(COALESCE(state, ''))) = 'west bengal'
      `,
      [district],
    );

    const row = result.rows[0];

    if (row) {
      stats = {
        total: Number(row.total) || 0,
        mapped: Number(row.mapped) || 0,
        review: Number(row.review) || 0,
        unresolved: Number(row.unresolved) || 0,
        rejected: Number(row.rejected) || 0,
      };
    }
  } catch (error) {
    console.error(
      `Failed to load dashboard statistics for ${district}:`,
      error,
    );

    databaseError = true;
  }

  const quickLinks = [
    {
      title: "Explore map",
      description: "View mapped locations and filter by administrative area.",
      href: districtHref("/map", district),
      icon: MapPinned,
      color: "orange",
    },
    {
      title: "Location records",
      description: "Search and inspect records belonging to this district.",
      href: districtHref("/records", district),
      icon: ClipboardList,
      color: "blue",
    },
    // {
    //   title: "Review queue",
    //   description: "Inspect records that need verification.",
    //   href: districtHref("/review", district),
    //   icon: ShieldAlert,
    //   color: "amber",
    // },
    // {
    //   title: "Rejected entries",
    //   description: "Review rejected records and their available details.",
    //   href: districtHref("/rejected", district),
    //   icon: XCircle,
    //   color: "red",
    // },
  ];

  const statCards = [
    {
      title: "Total records",
      value: stats.total,
      description: "Records in this district",
      icon: Database,
      color: "blue",
    },
    {
      title: "Mapped records",
      value: stats.mapped,
      description: getPercentage(stats.mapped, stats.total) + " of total",
      icon: CheckCircle2,
      color: "green",
    },
    {
      title: "Needs review",
      value: stats.review,
      description: "Records flagged for verification",
      icon: ShieldAlert,
      color: "amber",
    },
    {
      title: "Unresolved",
      value: stats.unresolved,
      description: "Records missing coordinates",
      icon: AlertCircle,
      color: "red",
    },
  ];

  const completionPercentage =
    stats.total > 0 ? Math.round((stats.mapped / stats.total) * 100) : 0;

  return (
    <main className="workspace-page">
      {/* Page heading */}
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <MapPinned size={15} />
            DISTRICT WORKSPACE
          </div>

          <h1>{district} dashboard</h1>

          <p>
            Monitor location data, geocoding progress, and records requiring
            verification for {district}, West Bengal.
          </p>
        </div>

        <Link
          href={districtHref("/map", district)}
          className="button button-primary"
        >
          <MapPinned size={16} />
          Open map
          <ArrowRight size={15} />
        </Link>
      </section>

      {/* Database error */}
      {databaseError && (
        <div className="inline-alert inline-alert-error" role="alert">
          <AlertCircle size={19} />

          <div>
            <strong>Dashboard statistics are unavailable</strong>
            <p>
              The database query failed. Check your PostgreSQL connection and
              server logs, then reload this page.
            </p>
          </div>
        </div>
      )}

      {/* District context */}
      <section className="panel district-overview-panel">
        <div className="district-overview-copy">
          <span className="panel-kicker">CURRENT DISTRICT</span>

          <h2>{district}</h2>

          <p>
            All statistics on this page are restricted to this district in West
            Bengal.
          </p>
        </div>

        <div className="district-overview-badge">
          <MapPinned size={17} />
          West Bengal
        </div>
      </section>

      {/* Statistics */}
      <section className="stats-grid" aria-label="District statistics">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <article
              className="stat-card"
              key={stat.title}
              data-tone={stat.color}
            >
              <div className="stat-card-top">
                <span className="stat-card-label">{stat.title}</span>

                <span className="stat-card-icon">
                  <Icon size={19} />
                </span>
              </div>

              <div className="stat-card-value">
                {databaseError ? "—" : formatNumber(stat.value)}
              </div>

              <p className="stat-card-description">
                {databaseError
                  ? "Unable to retrieve statistics"
                  : stat.description}
              </p>
            </article>
          );
        })}
      </section>

      {/* Mapping progress */}
      <section className="panel district-progress-panel">
        <div className="district-progress-heading">
          <div>
            <span className="panel-kicker">DATA COVERAGE</span>
            <h2>Coordinate coverage</h2>
            <p>
              Share of district records that currently have both latitude and
              longitude.
            </p>
          </div>

          <strong className="district-progress-percentage">
            {databaseError ? "—" : `${completionPercentage}%`}
          </strong>
        </div>

        <div
          className="district-progress-track"
          role="progressbar"
          aria-label="Coordinate coverage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={databaseError ? 0 : completionPercentage}
        >
          <div
            className="district-progress-fill"
            style={{
              width: databaseError ? "0%" : `${completionPercentage}%`,
            }}
          />
        </div>

        <div className="district-progress-footer">
          <span>{databaseError ? "—" : formatNumber(stats.mapped)} mapped</span>

          <span>
            {databaseError ? "—" : formatNumber(stats.unresolved)} unresolved
          </span>
        </div>
      </section>

      {/* Quick navigation */}
      <section className="district-section">
        <div className="district-section-heading">
          <div>
            <span className="panel-kicker">WORKSPACE</span>
            <h2>Manage district data</h2>
          </div>
        </div>

        <div className="district-quick-links">
          {quickLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                href={item.href}
                className="district-quick-link"
                key={item.title}
              >
                <span
                  className="district-quick-link-icon"
                  data-tone={item.color}
                >
                  <Icon size={20} />
                </span>

                <span className="district-quick-link-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>

                <ArrowRight size={17} className="district-quick-link-arrow" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Import data */}
      {process.env.NEXT_PUBLIC_SHOW_IMPORT_DATA_BUTTON !== "false" && (
        <section className="panel district-import-panel">
          <div className="district-import-icon">
            <Upload size={21} />
          </div>

          <div className="district-import-copy">
            <h2>Import location data</h2>
            <p>
              Add a dataset for processing. Review the import workflow before
              processing large files.
            </p>
          </div>

          <Link
            href={districtHref("/upload", district)}
            className="button button-secondary"
          >
            <Upload size={16} />
            Import data
            <ArrowRight size={15} />
          </Link>
        </section>
      )}

      {/* Data interpretation */}
      <p className="district-dashboard-note">
        <FileSearch size={15} />
        Mapped records may still require verification. Coordinate coverage
        measures the presence of coordinates, not their accuracy.
      </p>
    </main>
  );
}
