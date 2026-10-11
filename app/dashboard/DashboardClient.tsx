"use client";

import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  MapPinned,
  RefreshCw,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type DashboardData = {
  success: boolean;
  error?: string;
  records: {
    total: number;
    processed: number;
    review: number;
    unresolved: number;
    mapped: number;
  };
  reviews: {
    pending: number;
    approved: number;
    rejected: number;
    resolved: number;
  };
  jobs: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
  districts: number;
  recentJobs: Array<{
    id: number | string;
    file_name: string;
    total_rows: number;
    processed_rows: number;
    review_rows: number;
    unresolved_rows: number;
    error_rows: number;
    status: string;
    created_at: string;
  }>;
};

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(Number(value ?? 0));
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  return (
    <span className={`status-badge status-${normalized}`}>
      <span className="status-dot" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setError("");

      const response = await fetch("/api/dashboard", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load dashboard.");
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard statistics.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const cards = [
    {
      label: "Total location records",
      value: data?.records.total,
      description: "Records stored in the database",
      icon: Database,
      className: "stat-orange",
      href: "/records",
    },
    {
      label: "Successfully processed",
      value: data?.records.processed,
      description: "Records with processed status",
      icon: CheckCircle2,
      className: "stat-green",
      href: "/records?status=processed",
    },
    {
      label: "Needs review",
      value: data?.reviews.pending,
      description: "Records awaiting human review",
      icon: ShieldAlert,
      className: "stat-purple",
      href: "/review",
    },
    {
      label: "Mapped locations",
      value: data?.records.mapped,
      description: "Records with both coordinates",
      icon: MapPinned,
      className: "stat-blue",
      href: "/map",
    },
  ];

  return (
    <div className="workspace-page">
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">
            <Activity size={14} />
            LOCATION INTELLIGENCE WORKSPACE
          </div>

          <h1>Good to see you.</h1>

          <p>
            Monitor your imports, review address quality, and explore resolved
            locations across districts.
          </p>
        </div>

        <div className="heading-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setLoading(true);
              void loadDashboard();
            }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>

          <Link href="/upload" className="button button-primary">
            <Upload size={16} />
            Upload file
          </Link>
        </div>
      </section>

      {error && (
        <div className="inline-alert inline-alert-error" role="alert">
          <XCircle size={19} />
          <div>
            <strong>Dashboard unavailable</strong>
            <p>{error}</p>
          </div>
          <button type="button" onClick={() => void loadDashboard()}>
            Try again
          </button>
        </div>
      )}

      <section className="stats-grid" aria-label="Location statistics">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link key={card.label} href={card.href} className="stat-card">
              <div className={`stat-icon ${card.className}`}>
                <Icon size={21} />
              </div>

              <div className="stat-label">{card.label}</div>

              <div className="stat-value">
                {loading && !data ? "—" : formatNumber(card.value)}
              </div>

              <div className="stat-description">{card.description}</div>

              <div className="stat-card-footer">
                View details <ArrowUpRight size={15} />
              </div>
            </Link>
          );
        })}
      </section>

      <section className="dashboard-content-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">PIPELINE OVERVIEW</span>
              <h2>Processing activity</h2>
            </div>
            <Activity size={20} className="muted-icon" />
          </div>

          <div className="pipeline-list">
            <div className="pipeline-item">
              <span className="pipeline-icon pipeline-orange">
                <FileSpreadsheet size={18} />
              </span>
              <div className="pipeline-copy">
                <strong>Upload jobs</strong>
                <span>All submitted files</span>
              </div>
              <strong className="pipeline-value">
                {loading && !data ? "—" : formatNumber(data?.jobs.total)}
              </strong>
            </div>

            <div className="pipeline-item">
              <span className="pipeline-icon pipeline-blue">
                <Clock3 size={18} />
              </span>
              <div className="pipeline-copy">
                <strong>In progress</strong>
                <span>Waiting or processing</span>
              </div>
              <strong className="pipeline-value">
                {loading && !data ? "—" : formatNumber(data?.jobs.active)}
              </strong>
            </div>

            <div className="pipeline-item">
              <span className="pipeline-icon pipeline-green">
                <CheckCircle2 size={18} />
              </span>
              <div className="pipeline-copy">
                <strong>Completed jobs</strong>
                <span>Finished without queue errors</span>
              </div>
              <strong className="pipeline-value">
                {loading && !data ? "—" : formatNumber(data?.jobs.completed)}
              </strong>
            </div>

            <div className="pipeline-item">
              <span className="pipeline-icon pipeline-red">
                <XCircle size={18} />
              </span>
              <div className="pipeline-copy">
                <strong>Failed jobs</strong>
                <span>Require troubleshooting</span>
              </div>
              <strong className="pipeline-value">
                {loading && !data ? "—" : formatNumber(data?.jobs.failed)}
              </strong>
            </div>
          </div>

          <Link href="/jobs" className="panel-footer-link">
            View all processing jobs <ArrowRight size={16} />
          </Link>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">DATA QUALITY</span>
              <h2>Location coverage</h2>
            </div>
            <MapPinned size={20} className="muted-icon" />
          </div>

          <div className="coverage-highlight">
            <div className="coverage-number">
              {loading && !data ? "—" : formatNumber(data?.districts)}
            </div>
            <div>
              <strong>Districts represented</strong>
              <p>Distinct resolved district names in the records database.</p>
            </div>
          </div>

          <div className="coverage-row">
            <span>
              <span className="legend-dot legend-green" />
              Records with coordinates
            </span>
            <strong>
              {loading && !data ? "—" : formatNumber(data?.records.mapped)}
            </strong>
          </div>

          <div className="coverage-row">
            <span>
              <span className="legend-dot legend-purple" />
              Awaiting review
            </span>
            <strong>
              {loading && !data ? "—" : formatNumber(data?.reviews.pending)}
            </strong>
          </div>

          <div className="coverage-row">
            <span>
              <span className="legend-dot legend-orange" />
              Unresolved records
            </span>
            <strong>
              {loading && !data ? "—" : formatNumber(data?.records.unresolved)}
            </strong>
          </div>

          <Link href="/review" className="panel-footer-link">
            Inspect data quality <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="panel recent-jobs-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">LATEST ACTIVITY</span>
            <h2>Recent uploads</h2>
            <p className="panel-subtitle">
              The latest files submitted to your processing queue.
            </p>
          </div>

          <Link href="/jobs" className="button button-secondary">
            All jobs <ArrowUpRight size={15} />
          </Link>
        </div>

        {loading && !data ? (
          <div className="empty-state">
            <RefreshCw size={23} className="spin" />
            <p>Loading recent uploads…</p>
          </div>
        ) : data?.recentJobs.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Rows</th>
                  <th>Processed</th>
                  <th>Review</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {data.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <div className="file-cell">
                        <span className="file-cell-icon">
                          <FileSpreadsheet size={17} />
                        </span>
                        <span title={job.file_name}>{job.file_name}</span>
                      </div>
                    </td>
                    <td>{formatNumber(job.total_rows)}</td>
                    <td>{formatNumber(job.processed_rows)}</td>
                    <td>{formatNumber(job.review_rows)}</td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="date-cell">{formatDate(job.created_at)}</td>
                    <td>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="table-action"
                        aria-label={`View job ${job.id}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <FileSpreadsheet size={28} />
            <strong>No uploads yet</strong>
            <p>Upload a spreadsheet to start resolving your location data.</p>
            <Link href="/upload" className="button button-primary">
              <Upload size={16} />
              Upload your first file
            </Link>
          </div>
        )}
      </section>

      <section className="dashboard-quick-actions">
        <Link href="/upload" className="quick-action-card">
          <span className="quick-action-icon quick-action-orange">
            <Upload size={20} />
          </span>
          <div>
            <strong>Import a spreadsheet</strong>
            <p>Queue an Excel or CSV file for processing.</p>
          </div>
          <ArrowUpRight size={17} />
        </Link>

        <Link href="/records" className="quick-action-card">
          <span className="quick-action-icon quick-action-blue">
            <Database size={20} />
          </span>
          <div>
            <strong>Explore location records</strong>
            <p>Search normalized records and export results.</p>
          </div>
          <ArrowUpRight size={17} />
        </Link>

        <Link href="/review" className="quick-action-card">
          <span className="quick-action-icon quick-action-purple">
            <ArrowDownRight size={20} />
          </span>
          <div>
            <strong>Review uncertain locations</strong>
            <p>Inspect records that need human verification.</p>
          </div>
          <ArrowUpRight size={17} />
        </Link>
      </section>
    </div>
  );
}
