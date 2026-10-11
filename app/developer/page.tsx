import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Database,
  FileWarning,
  MapPinned,
  UploadCloud,
  Workflow,
} from "lucide-react";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverviewStats = {
  total: number;
  mapped: number;
  review: number;
  unresolved: number;
  rejected: number;
  processing: number;
  failedJobs: number;
};

const EMPTY_STATS: OverviewStats = {
  total: 0,
  mapped: 0,
  review: 0,
  unresolved: 0,
  rejected: 0,
  processing: 0,
  failedJobs: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

async function getOverviewStats(): Promise<{
  stats: OverviewStats;
  error: string | null;
}> {
  if (!db) {
    return {
      stats: EMPTY_STATS,
      error:
        "PostgreSQL is not configured. Check DATABASE_URL_POOLED or DATABASE_URL.",
    };
  }

  try {
    const [recordsResult, jobsResult] = await Promise.all([
      db.query<{
        total: string;
        mapped: string;
        review: string;
        unresolved: string;
        rejected: string;
      }>(`
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
              OR LOWER(BTRIM(COALESCE(status, ''))) = 'unresolved'
          )::text AS unresolved,

          COUNT(*) FILTER (
            WHERE LOWER(BTRIM(COALESCE(status, ''))) = 'rejected'
          )::text AS rejected

        FROM location_records
      `),

      db.query<{
        processing: string;
        failed: string;
      }>(`
        SELECT
          COUNT(*) FILTER (
            WHERE LOWER(BTRIM(COALESCE(status, '')))
              IN ('pending', 'processing')
          )::text AS processing,

          COUNT(*) FILTER (
            WHERE LOWER(BTRIM(COALESCE(status, '')))
              IN ('failed', 'error')
          )::text AS failed

        FROM upload_jobs
      `),
    ]);

    const records = recordsResult.rows[0];
    const jobs = jobsResult.rows[0];

    return {
      stats: {
        total: Number(records?.total ?? 0),
        mapped: Number(records?.mapped ?? 0),
        review: Number(records?.review ?? 0),
        unresolved: Number(records?.unresolved ?? 0),
        rejected: Number(records?.rejected ?? 0),
        processing: Number(jobs?.processing ?? 0),
        failedJobs: Number(jobs?.failed ?? 0),
      },
      error: null,
    };
  } catch (error) {
    console.error("Developer overview query failed:", error);

    return {
      stats: EMPTY_STATS,
      error:
        "The overview could not load its database statistics. Check the database schema and connection.",
    };
  }
}

const shortcuts = [
  {
    href: "/developer/map",
    title: "West Bengal map",
    description:
      "Explore the state, filter districts and blocks, and inspect individual locations.",
    icon: MapPinned,
    tone: "orange",
    label: "Open map",
  },
  {
    href: "/developer/jobs",
    title: "Uploads & processing",
    description:
      "Monitor import jobs, processing progress, row failures, and retry status.",
    icon: UploadCloud,
    tone: "blue",
    label: "View jobs",
  },
  {
    href: "/developer/records",
    title: "All records",
    description: "Search and inspect location records across all districts.",
    icon: Database,
    tone: "green",
    label: "Browse records",
  },
  {
    href: "/developer/rejected",
    title: "Rejected entries",
    description: "Investigate rejected records and their recorded reasons.",
    icon: FileWarning,
    tone: "red",
    label: "Review entries",
  },
  {
    href: "/developer/exports",
    title: "Export center",
    description: "Prepare statewide or filtered data exports.",
    icon: Workflow,
    tone: "purple",
    label: "Manage exports",
  },
];

export default async function DeveloperOverviewPage() {
  const { stats, error } = await getOverviewStats();

  const coverage =
    stats.total > 0 ? Math.round((stats.mapped / stats.total) * 100) : 0;

  const cards = [
    {
      label: "Total records",
      value: stats.total,
      description: "Across all districts",
      icon: Database,
      tone: "orange",
    },
    {
      label: "Coordinates present",
      value: stats.mapped,
      description: `${coverage}% coordinate coverage`,
      icon: MapPinned,
      tone: "blue",
    },
    {
      label: "Needs review",
      value: stats.review,
      description: "Records awaiting verification",
      icon: CircleHelp,
      tone: "purple",
    },
    {
      label: "Unresolved",
      value: stats.unresolved,
      description: "Records missing coordinates or marked unresolved",
      icon: AlertTriangle,
      tone: "red",
    },
  ];

  return (
    <main className="workspace-page developer-overview">
      <section className="page-heading developer-page-heading">
        <div>
          <div className="eyebrow">
            <Workflow size={14} />
            GLOBAL CONTROL CENTER
          </div>

          <h1>Developer Panel</h1>

          <p>
            Manage the West Bengal location dataset, monitor processing,
            investigate data quality, and explore records statewide.
          </p>
        </div>

        <Link href="/developer/map" className="button button-primary">
          <MapPinned size={16} />
          Explore statewide map
          <ArrowRight size={15} />
        </Link>
      </section>

      {error && (
        <div className="developer-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Database statistics unavailable</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="developer-stats-grid" aria-label="Global statistics">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <article className="developer-stat-card" key={card.label}>
              <div className={`developer-stat-icon ${card.tone}`}>
                <Icon size={19} />
              </div>

              <div className="developer-stat-label">{card.label}</div>

              <div className="developer-stat-value">
                {formatNumber(card.value)}
              </div>

              <p>{card.description}</p>
            </article>
          );
        })}
      </section>

      <section className="developer-progress-panel panel">
        <div className="developer-progress-top">
          <div>
            <div className="panel-kicker">DATASET COVERAGE</div>
            <h2>West Bengal records</h2>
            <p>Track coordinate coverage across the statewide dataset.</p>
          </div>

          <div className="developer-coverage-value">{coverage}%</div>
        </div>

        <div
          className="developer-progress-track"
          role="progressbar"
          aria-label="Records with coordinates"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={coverage}
        >
          <div
            className="developer-progress-fill"
            style={{ width: `${coverage}%` }}
          />
        </div>

        <div className="developer-progress-footer">
          <span>{formatNumber(stats.mapped)} records have coordinates</span>
          <span>
            {formatNumber(Math.max(0, stats.total - stats.mapped))} without
            complete coordinates
          </span>
        </div>

        <p className="developer-quality-note">
          <CheckCircle2 size={15} />
          Coordinate presence does not prove coordinate accuracy. Estimated
          locations must remain distinguishable from verified locations.
        </p>
      </section>

      <section className="developer-section">
        <div className="developer-section-heading">
          <div>
            <div className="panel-kicker">DATA MANAGEMENT</div>
            <h2>Developer tools</h2>
            <p>Choose a workspace to manage the statewide dataset.</p>
          </div>
        </div>

        <div className="developer-tools-grid">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;

            return (
              <Link
                href={shortcut.href}
                className="developer-tool-card"
                key={shortcut.href}
              >
                <span className={`developer-tool-icon ${shortcut.tone}`}>
                  <Icon size={20} />
                </span>

                <span className="developer-tool-copy">
                  <strong>{shortcut.title}</strong>
                  <span>{shortcut.description}</span>
                  <span className="developer-tool-action">
                    {shortcut.label}
                    <ArrowRight size={14} />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="developer-operations-grid">
        <article className="panel developer-operations-card">
          <div className="panel-kicker">PROCESSING HEALTH</div>
          <h2>Upload pipeline</h2>

          <div className="developer-operation-row">
            <span>
              <span className="developer-status-dot processing" />
              Active or pending jobs
            </span>
            <strong>{formatNumber(stats.processing)}</strong>
          </div>

          <div className="developer-operation-row">
            <span>
              <span className="developer-status-dot failed" />
              Failed jobs
            </span>
            <strong>{formatNumber(stats.failedJobs)}</strong>
          </div>

          <Link href="/developer/jobs" className="developer-inline-link">
            Inspect processing jobs <ArrowRight size={14} />
          </Link>
        </article>

        <article className="panel developer-operations-card">
          <div className="panel-kicker">DATA QUALITY</div>
          <h2>Records requiring attention</h2>

          <div className="developer-operation-row">
            <span>Review queue</span>
            <strong>{formatNumber(stats.review)}</strong>
          </div>

          <div className="developer-operation-row">
            <span>Unresolved</span>
            <strong>{formatNumber(stats.unresolved)}</strong>
          </div>

          <div className="developer-operation-row">
            <span>Rejected</span>
            <strong>{formatNumber(stats.rejected)}</strong>
          </div>

          <Link href="/developer/rejected" className="developer-inline-link">
            Inspect rejected entries <ArrowRight size={14} />
          </Link>
        </article>
      </section>

      <div className="developer-notice">
        <AlertTriangle size={17} />
        <p>
          Developer Panel has no login by design. If this application is
          publicly reachable, restrict access at the deployment or network level
          before using these global data-management tools with sensitive data.
        </p>
      </div>
    </main>
  );
}
