"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import "./DeveloperDataPages.css";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Search,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ApiResponse<T> = {
  success?: boolean;
  error?: string;
  message?: string;
  records?: T[];
  jobs?: T[];
  exports?: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  stats?: Record<string, number>;
  filters?: { districts?: string[] };
};

type LiveRecord = {
  id: string | number;
  original_address?: string | null;
  full_address?: string | null;
  recipient_name?: string | null;
  village_name?: string | null;
  landmark?: string | null;
  tehsil_taluka?: string | null;
  block_name?: string | null;
  police_station_name?: string | null;
  district?: string | null;
  state?: string | null;
  post_office_name?: string | null;
  pin_code?: string | number | null;
  phone_number?: string | null;
  ro_sro?: string | null;
  branch_office?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  normalization_provider?: string | null;
  geocode_provider?: string | null;
  confidence_score?: number | string | null;
  status?: string | null;
  error_message?: string | null;
  source_row_number?: number | null;
  source_file_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ImportJob = {
  id: string | number;
  filename?: string | null;
  source_file_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  total_rows?: number | null;
  processed_rows?: number | null;
  review_rows?: number | null;
  unresolved_rows?: number | null;
  error_rows?: number | null;
  total?: number | null;
  processed?: number | null;
  review?: number | null;
  unresolved?: number | null;
  errors?: number | null;
};

type ExportJob = {
  id: string | number;
  filename?: string | null;
  format?: string | null;
  scope?: string | null;
  status?: string | null;
  created_at?: string | null;
  record_count?: number | null;
  records?: number | null;
  download_url?: string | null;
};

type ApiState = "loading" | "ready" | "empty" | "error";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatNumber(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-IN") : "0";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(payload: ApiResponse<unknown>, status: number) {
  return (
    payload.message ||
    payload.error ||
    `Request failed (${status}). Check that the API route is implemented and the database is available.`
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as ApiResponse<unknown> & T;

  if (!response.ok || payload.success === false) {
    throw new Error(getErrorMessage(payload, response.status));
  }

  return payload;
}

function coordinateQuality(record: LiveRecord) {
  const hasCoordinates =
    record.latitude !== null &&
    record.latitude !== undefined &&
    record.longitude !== null &&
    record.longitude !== undefined &&
    record.latitude !== "" &&
    record.longitude !== "";

  if (!hasCoordinates) return "Missing";

  if (
    record.geocode_provider
      ?.toLowerCase()
      .startsWith("gemini-estimate-unverified")
  ) {
    return "Estimated";
  }

  return "Non-estimated";
}

function coordinateQualityClass(record: LiveRecord) {
  const quality = coordinateQuality(record).toLowerCase();

  if (quality === "missing") return "missing";
  if (quality === "estimated") return "estimated";

  return "non-estimated";
}

function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="dev-data-heading">
      <div>
        <div className="dev-data-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="dev-data-heading-action">{children}</div>}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "orange",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Database;
  tone?: "orange" | "blue" | "purple" | "red" | "green";
}) {
  return (
    <div className="dev-data-stat">
      <div className={`dev-data-stat-icon ${tone}`}>
        <Icon size={19} />
      </div>
      <span className="dev-data-stat-label">{label}</span>
      <strong className="dev-data-stat-value">{value}</strong>
      <span className="dev-data-stat-hint">{hint}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");

  return (
    <span className={`dev-status-badge ${normalized}`}>
      <span />
      {status}
    </span>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="dev-data-search">
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}

function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="dev-data-pagination">
      <span>
        Page {page} of {Math.max(1, pages)}
      </span>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function TableEmpty({ message }: { message: string }) {
  return (
    <div className="dev-data-empty">
      <Database size={24} />
      <strong>No records found</strong>
      <p>{message}</p>
    </div>
  );
}

function DataFeedback({
  state,
  error,
  emptyMessage,
  onRetry,
}: {
  state: ApiState;
  error: string;
  emptyMessage: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div className="dev-records-loading" role="status">
        <LoaderCircle size={22} className="dev-records-spinner" />
        <span>Loading data from the database…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="dev-records-error" role="alert">
        <AlertCircle size={19} />
        <div>
          <strong>Unable to load live data</strong>
          <p>{error}</p>
          <button
            type="button"
            className="dev-data-button secondary"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return <TableEmpty message={emptyMessage} />;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Import Jobs — live API only                                                */
/*                                                                            */
/* Expected API: GET /api/developer/jobs                                     */
/* Expected response: { success: true, jobs: [...], stats?: {...} }          */
/* No local or demo fallback is used.                                        */
/* -------------------------------------------------------------------------- */

export function ImportJobsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [state, setState] = useState<ApiState>("loading");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);

  const loadJobs = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");

    try {
      const payload = await requestJson<ApiResponse<ImportJob>>(
        "/api/developer/jobs",
        { signal },
      );

      const items = Array.isArray(payload.jobs) ? payload.jobs : [];
      setJobs(items);
      setState(items.length ? "ready" : "empty");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;

      setJobs([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load import jobs.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadJobs(controller.signal);
    return () => controller.abort();
  }, [loadJobs, reloadKey]);

  const filteredJobs = jobs.filter((job) => {
    const filename = job.filename || job.source_file_name || "";
    const matchesSearch = `${filename} ${job.id}`
      .toLowerCase()
      .includes(search.toLowerCase());

    const normalizedStatus = (job.status || "").toLowerCase();
    const matchesStatus =
      statusFilter === "all" || normalizedStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const countStatus = (wanted: string) =>
    jobs.filter((job) => (job.status || "").toLowerCase() === wanted).length;

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again after an upload.
    event.target.value = "";

    if (!file) return;

    setUploading(true);
    setUploadMessage("");
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.error || `Upload failed with status ${response.status}.`,
        );
      }

      const jobId = result.job?.id;
      const queued = result.addressesQueued;

      setUploadMessage(
        `${file.name} uploaded successfully. ${
          queued !== undefined
            ? `${queued} address rows queued for processing.`
            : "Rows queued for processing."
        }${jobId !== undefined ? ` Job ID: ${jobId}.` : ""}`,
      );

      // Refresh the real upload-job history.
      setReloadKey((value) => value + 1);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to upload the selected file.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="DATA MANAGEMENT / IMPORTS"
        title="Import Jobs"
        description="Track actual uploads and processing results stored by the application."
      >
        <div className="dev-data-heading-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            hidden
            onChange={handleFileSelected}
          />

          <button
            type="button"
            className="dev-data-button primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <LoaderCircle size={16} className="dev-records-spinner" />
            ) : (
              <UploadCloud size={16} />
            )}
            {uploading ? "Uploading..." : "Upload File"}
          </button>

          <button
            type="button"
            className="dev-data-button secondary"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={state === "loading" || uploading}
          >
            <ArrowDownToLine size={16} />
            Refresh jobs
          </button>
        </div>
      </PageHeading>

      {uploadMessage && (
        <div className="dev-upload-feedback success" role="status">
          <CheckCircle2 size={18} />
          <span>{uploadMessage}</span>
        </div>
      )}

      {uploadError && (
        <div className="dev-upload-feedback error" role="alert">
          <AlertCircle size={18} />
          <span>{uploadError}</span>
        </div>
      )}

      <div className="dev-data-stat-grid">
        <StatCard
          label="Total jobs"
          value={formatNumber(jobs.length)}
          hint="Jobs returned by the API"
          icon={Database}
        />
        <StatCard
          label="Completed"
          value={formatNumber(countStatus("completed"))}
          hint="Stored completed jobs"
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Needs review"
          value={formatNumber(countStatus("review"))}
          hint="Stored job status"
          icon={ShieldAlert}
          tone="purple"
        />
        <StatCard
          label="Failed"
          value={formatNumber(countStatus("failed"))}
          hint="Stored failed jobs"
          icon={AlertCircle}
          tone="red"
        />
      </div>

      <section className="dev-data-panel">
        <div className="dev-data-panel-heading">
          <div>
            <h2>Upload history</h2>
            <p>History is loaded from the jobs API, not sample data.</p>
          </div>
          <span className="dev-data-count">
            {state === "loading" ? "Loading…" : `${filteredJobs.length} jobs`}
          </span>
        </div>

        <div className="dev-data-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search filename or job ID..."
          />
          <label className="dev-data-select">
            <Filter size={15} />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="review">Review</option>
              <option value="needs review">Needs review</option>
              <option value="failed">Failed</option>
              <option value="error">Error</option>
            </select>
          </label>
        </div>

        {state === "error" || state === "loading" ? (
          <DataFeedback
            state={state}
            error={error}
            emptyMessage=""
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : filteredJobs.length === 0 ? (
          <TableEmpty message="No rejected, error, or unresolved records match your search." />
        ) : (
          <div className="dev-data-table-wrap">
            <table className="dev-data-table">
              <thead>
                <tr>
                  <th>Source file</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Total rows</th>
                  <th>Processed</th>
                  <th>Review</th>
                  <th>Unresolved</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const total = Number(job.total_rows ?? job.total ?? 0);
                  const processed = Number(
                    job.processed_rows ?? job.processed ?? 0,
                  );
                  const filename =
                    job.filename || job.source_file_name || "Unnamed file";

                  return (
                    <tr key={String(job.id)}>
                      <td>
                        <div className="dev-data-file-cell">
                          <span className="dev-data-file-icon">
                            <FileSpreadsheet size={17} />
                          </span>
                          <div>
                            <strong>{filename}</strong>
                            <small>{String(job.id)}</small>
                          </div>
                        </div>
                      </td>
                      <td className="dev-data-muted">
                        {formatDate(job.created_at)}
                      </td>
                      <td>
                        <StatusBadge status={displayValue(job.status)} />
                      </td>
                      <td>{formatNumber(total)}</td>
                      <td>{formatNumber(processed)}</td>
                      <td>{formatNumber(job.review_rows ?? job.review)}</td>
                      <td>
                        {formatNumber(job.unresolved_rows ?? job.unresolved)}
                      </td>
                      <td>{formatNumber(job.error_rows ?? job.errors)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* All Records — existing live records API                                    */
/* -------------------------------------------------------------------------- */

export function AllRecordsPage() {
  const [records, setRecords] = useState<LiveRecord[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("all");
  const [status, setStatus] = useState("all");
  const [quality, setQuality] = useState("all");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [pagination, setPagination] =
    useState<ApiResponse<LiveRecord>["pagination"]>();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [state, setState] = useState<ApiState>("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<LiveRecord | null>(null);

  const pageSize = 25;

  const loadRecords = useCallback(
    async (signal?: AbortSignal) => {
      setState("loading");
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: search.trim(),
        district: district === "all" ? "" : district,
        status: status === "all" ? "" : status,
        quality: quality === "all" ? "" : quality,
      });

      try {
        const payload = await requestJson<ApiResponse<LiveRecord>>(
          `/api/developer/records?${params.toString()}`,
          { signal },
        );

        const items = Array.isArray(payload.records) ? payload.records : [];
        setRecords(items);
        setPagination(payload.pagination);
        setStats(payload.stats ?? {});
        setDistricts(payload.filters?.districts ?? []);
        setState(items.length ? "ready" : "empty");
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;

        setRecords([]);
        setPagination(undefined);
        setStats({});
        setError(
          caught instanceof Error ? caught.message : "Unable to load records.",
        );
        setState("error");
      }
    },
    [page, search, district, status, quality],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRecords(controller.signal);
    return () => controller.abort();
  }, [loadRecords, reloadKey]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
    setSelected(null);
  }

  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const currentPage = Math.min(page, totalPages);
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);

  const detailFields: Array<[string, keyof LiveRecord]> = [
    ["Record ID", "id"],
    ["Status", "status"],
    ["Original address", "original_address"],
    ["Full address", "full_address"],
    ["Recipient name", "recipient_name"],
    ["Village / locality", "village_name"],
    ["Landmark", "landmark"],
    ["Tehsil / Taluka", "tehsil_taluka"],
    ["Block", "block_name"],
    ["Police station", "police_station_name"],
    ["District", "district"],
    ["State", "state"],
    ["Post office", "post_office_name"],
    ["PIN code", "pin_code"],
    ["Phone number", "phone_number"],
    ["RO / SRO", "ro_sro"],
    ["Branch office", "branch_office"],
    ["Latitude", "latitude"],
    ["Longitude", "longitude"],
    ["Geocoding provider", "geocode_provider"],
    ["Normalization provider", "normalization_provider"],
    ["Confidence score", "confidence_score"],
    ["Source file", "source_file_name"],
    ["Source row", "source_row_number"],
    ["Error message", "error_message"],
    ["Created at", "created_at"],
    ["Updated at", "updated_at"],
  ];

  return (
    <>
      <PageHeading
        eyebrow="DATA MANAGEMENT / DATABASE"
        title="All Records"
        description="Search and inspect actual location records across all districts."
      >
        <button
          type="button"
          className="dev-data-button secondary"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={state === "loading"}
        >
          <ArrowDownToLine size={16} />
          Refresh records
        </button>
      </PageHeading>

      <div className="dev-data-stat-grid">
        <StatCard
          label="Total records"
          value={formatNumber(stats.total)}
          hint="Database count"
          icon={Database}
        />
        <StatCard
          label="Needs review"
          value={formatNumber(stats.review)}
          hint="Database status count"
          icon={ShieldAlert}
          tone="purple"
        />
        <StatCard
          label="With coordinates"
          value={formatNumber(stats.mapped)}
          hint="Coordinates present"
          icon={CheckCircle2}
          tone="blue"
        />
        <StatCard
          label="Missing coordinates"
          value={formatNumber(stats.missing)}
          hint="Latitude or longitude missing"
          icon={AlertCircle}
          tone="red"
        />
      </div>

      <section className="dev-data-panel">
        <div className="dev-data-panel-heading">
          <div>
            <h2>Location records</h2>
            <p>Filtering and pagination run on the server.</p>
          </div>
          <span className="dev-data-count">
            {state === "loading"
              ? "Loading…"
              : `${formatNumber(total)} results`}
          </span>
        </div>

        <div className="dev-data-toolbar dev-data-toolbar-wrap">
          <SearchBox
            value={search}
            onChange={(value) => updateFilter(setSearch, value)}
            placeholder="Search address, district, PIN or ID..."
          />
          <label className="dev-data-select">
            <Filter size={15} />
            <select
              value={district}
              onChange={(event) =>
                updateFilter(setDistrict, event.target.value)
              }
            >
              <option value="all">All districts</option>
              {districts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="dev-data-select">
            <select
              value={status}
              onChange={(event) => updateFilter(setStatus, event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="processed">Processed</option>
              <option value="review">Review</option>
              <option value="unresolved">Unresolved</option>
              <option value="rejected">Rejected</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="dev-data-select">
            <select
              value={quality}
              onChange={(event) => updateFilter(setQuality, event.target.value)}
            >
              <option value="all">All coordinate types</option>
              <option value="estimated">Estimated</option>
              <option value="missing">Missing</option>
              <option value="verified">Non-estimated coordinates</option>
            </select>
          </label>
        </div>

        <DataFeedback
          state={state === "empty" ? "ready" : state}
          error={error}
          emptyMessage=""
          onRetry={() => setReloadKey((value) => value + 1)}
        />

        {state === "ready" && records.length === 0 && (
          <TableEmpty message="No database records match the current filters." />
        )}

        {state === "ready" && records.length > 0 && (
          <div className="dev-data-table-wrap">
            <table className="dev-data-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>District</th>
                  <th>Locality</th>
                  <th>PIN code</th>
                  <th>Status</th>
                  <th>Coordinates</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const address =
                    record.full_address ||
                    record.original_address ||
                    record.village_name ||
                    "Address unavailable";

                  const locality =
                    record.village_name ||
                    record.post_office_name ||
                    record.landmark ||
                    "—";

                  return (
                    <tr key={String(record.id)}>
                      <td>
                        <div className="dev-data-primary-cell">
                          <strong>{address}</strong>
                          <small>
                            ID: {String(record.id)}
                            {record.source_file_name
                              ? ` · ${record.source_file_name}`
                              : ""}
                          </small>
                        </div>
                      </td>
                      <td>{displayValue(record.district)}</td>
                      <td>{locality}</td>
                      <td>{displayValue(record.pin_code)}</td>
                      <td>
                        <StatusBadge status={displayValue(record.status)} />
                      </td>
                      <td>
                        <span
                          className={`dev-status-badge ${coordinateQualityClass(record)}`}
                          title={
                            record.geocode_provider || "Provider not specified"
                          }
                        >
                          <span />
                          {coordinateQuality(record)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dev-data-icon-button"
                          aria-label={`Inspect record ${record.id}`}
                          title="View record details"
                          onClick={() => setSelected(record)}
                        >
                          <Eye size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {state !== "error" && (
          <div className="dev-records-pagination-row">
            <span>
              Showing {start.toLocaleString("en-IN")}–
              {end.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}{" "}
              records
            </span>
            <Pagination
              page={currentPage}
              pages={totalPages}
              onChange={setPage}
            />
          </div>
        )}
      </section>

      {selected && (
        <div
          className="dev-data-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="dev-data-modal dev-record-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-record-modal-title"
          >
            <div className="dev-data-modal-heading">
              <div>
                <span className="dev-data-eyebrow">LIVE DATABASE RECORD</span>
                <h2 id="live-record-modal-title">
                  Record #{String(selected.id)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close record details"
              >
                <X size={19} />
              </button>
            </div>

            <div className="dev-record-detail-grid">
              {detailFields.map(([label, key]) => (
                <div className="dev-record-detail-item" key={key}>
                  <span>{label}</span>
                  <strong>{displayValue(selected[key])}</strong>
                </div>
              ))}
              <div className="dev-record-detail-item">
                <span>Coordinate quality</span>
                <strong>{coordinateQuality(selected)}</strong>
              </div>
            </div>

            <div className="dev-data-modal-actions">
              <button
                type="button"
                className="dev-data-button primary"
                onClick={() => setSelected(null)}
              >
                Close details
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Rejected Records — real records API only                                   */
/* -------------------------------------------------------------------------- */

export function RejectedRecordsPage() {
  const [records, setRecords] = useState<LiveRecord[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [pagination, setPagination] =
    useState<ApiResponse<LiveRecord>["pagination"]>();
  const [state, setState] = useState<ApiState>("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<LiveRecord | null>(null);

  const pageSize = 25;

  const loadRejected = useCallback(
    async (signal?: AbortSignal) => {
      setState("loading");
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: search.trim(),
        status: "problem",
      });

      try {
        const payload = await requestJson<ApiResponse<LiveRecord>>(
          `/api/developer/records?${params.toString()}`,
          { signal },
        );

        const items = Array.isArray(payload.records) ? payload.records : [];
        setRecords(items);
        setPagination(payload.pagination);
        setState(items.length ? "ready" : "empty");
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;

        setRecords([]);
        setPagination(undefined);
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load rejected records.",
        );
        setState("error");
      }
    },
    [page, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRejected(controller.signal);
    return () => controller.abort();
  }, [loadRejected, reloadKey]);

  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const total = pagination?.total ?? 0;

  return (
    <>
      <PageHeading
        eyebrow="DATA MANAGEMENT / DATA QUALITY"
        title="Rejected Records"
        description="Review rejected, errored, and unresolved location records."
      >
        <button
          type="button"
          className="dev-data-button secondary"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={state === "loading"}
        >
          <ArrowDownToLine size={16} />
          Refresh
        </button>
      </PageHeading>

      <div className="dev-data-stat-grid">
        <StatCard
          label="Rejected records"
          value={formatNumber(total)}
          hint="Database query result"
          icon={ShieldAlert}
          tone="red"
        />
        <StatCard
          label="Current page"
          value={formatNumber(records.length)}
          hint="Records loaded"
          icon={Database}
        />
      </div>

      <section className="dev-data-panel">
        <div className="dev-data-panel-heading">
          <div>
            <h2>Rejected entries</h2>
            <p>Only rows with status=rejected are requested from the API.</p>
          </div>
          <span className="dev-data-count">
            {state === "loading"
              ? "Loading…"
              : `${formatNumber(total)} results`}
          </span>
        </div>

        <div className="dev-data-toolbar">
          <SearchBox
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search rejected records..."
          />
        </div>

        {state === "error" || state === "loading" ? (
          <DataFeedback
            state={state}
            error={error}
            emptyMessage=""
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : state === "empty" ? (
          <TableEmpty message="There are currently no records with rejected status." />
        ) : (
          <>
            <div className="dev-data-table-wrap">
              <table className="dev-data-table">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>District</th>
                    <th>State</th>
                    <th>Source file</th>
                    <th>Status</th>
                    <th>Last updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={String(record.id)}>
                      <td>
                        <div className="dev-data-primary-cell">
                          <strong>
                            {record.full_address ||
                              record.original_address ||
                              "Address unavailable"}
                          </strong>
                          <small>ID: {String(record.id)}</small>
                        </div>
                      </td>
                      <td>{displayValue(record.district)}</td>
                      <td>{displayValue(record.state)}</td>
                      <td>{displayValue(record.source_file_name)}</td>
                      <td>
                        <StatusBadge status={displayValue(record.status)} />
                      </td>
                      <td className="dev-data-muted">
                        {formatDate(record.updated_at || record.created_at)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dev-data-icon-button"
                          title="Inspect record"
                          aria-label={`Inspect rejected record ${record.id}`}
                          onClick={() => setSelected(record)}
                        >
                          <Eye size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dev-records-pagination-row">
              <span>
                {records.length.toLocaleString("en-IN")} records on this page
              </span>
              <Pagination page={page} pages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </section>

      {selected && (
        <div
          className="dev-data-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="dev-data-modal dev-record-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejected-record-title"
          >
            <div className="dev-data-modal-heading">
              <div>
                <span className="dev-data-eyebrow">DATABASE RECORD</span>
                <h2 id="rejected-record-title">
                  Record #{String(selected.id)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
              >
                <X size={19} />
              </button>
            </div>

            <div className="dev-record-detail-grid">
              {(
                [
                  [
                    "Address",
                    selected.full_address || selected.original_address,
                  ],
                  ["District", selected.district],
                  ["State", selected.state],
                  ["Status", selected.status],
                  ["Error / reason", selected.error_message],
                  ["Source file", selected.source_file_name],
                  ["Source row", selected.source_row_number],
                  ["Created", formatDate(selected.created_at)],
                  ["Updated", formatDate(selected.updated_at)],
                ] as Array<[string, unknown]>
              ).map(([label, value]) => (
                <div className="dev-record-detail-item" key={label}>
                  <span>{label}</span>
                  <strong>{displayValue(value)}</strong>
                </div>
              ))}
            </div>

            <div className="dev-data-modal-actions">
              <button
                type="button"
                className="dev-data-button primary"
                onClick={() => setSelected(null)}
              >
                Close details
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Export Center — real export API only                                       */
/*                                                                            */
/* GET  /api/developer/exports: export history                                */
/* POST /api/developer/exports: create an export                              */
/* If these APIs do not exist, show an error. No fake history is displayed.   */
/* -------------------------------------------------------------------------- */

export function ExportCenterPage() {
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [format, setFormat] = useState("csv");
  const [scope, setScope] = useState("all");
  const [district, setDistrict] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [includeCoordinates, setIncludeCoordinates] = useState(true);
  const [includeOriginalAddress, setIncludeOriginalAddress] = useState(true);
  const [includeQuality, setIncludeQuality] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ApiState>("loading");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const loadExports = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");

    try {
      const payload = await requestJson<
        ApiResponse<ExportJob> & { filters?: { districts?: string[] } }
      >("/api/developer/exports", { signal });

      const items = Array.isArray(payload.exports) ? payload.exports : [];
      setExports(items);
      setDistricts(payload.filters?.districts ?? []);
      setState(items.length ? "ready" : "empty");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;

      setExports([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load export history.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadExports(controller.signal);
    return () => controller.abort();
  }, [loadExports, reloadKey]);

  async function createExport() {
    setCreating(true);
    setActionMessage("");
    setError("");

    try {
      const payload = await requestJson<
        ApiResponse<ExportJob> & { download_url?: string }
      >("/api/developer/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          scope,
          district: district === "all" ? null : district,
          status: statusFilter === "all" ? null : statusFilter,
          includeOriginalAddress,
          includeCoordinates,
          includeQuality,
        }),
      });

      const downloadUrl =
        payload.download_url ||
        (payload as ApiResponse<ExportJob>).exports?.[0]?.download_url;

      if (downloadUrl) {
        window.location.assign(downloadUrl);
        setActionMessage("Export request completed.");
      } else {
        setActionMessage(
          "The API accepted the request. No download URL was returned.",
        );
      }

      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create export.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="DATA MANAGEMENT / EXPORTS"
        title="Export Center"
        description="Create exports from database records and inspect actual export history."
      >
        <button
          type="button"
          className="dev-data-button secondary"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={state === "loading"}
        >
          <ArrowDownToLine size={16} />
          Refresh history
        </button>
      </PageHeading>

      <div className="dev-data-export-layout">
        <section className="dev-data-panel">
          <div className="dev-data-panel-heading">
            <div>
              <h2>Configure export</h2>
              <p>
                The API must apply filters and generate the file server-side.
              </p>
            </div>
            <Download size={19} />
          </div>

          <div className="dev-data-export-form">
            <label className="dev-data-form-field">
              <span>Export scope</span>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="all">All records</option>
                <option value="filtered">Records matching filters</option>
                <option value="review">Records needing review</option>
                <option value="unresolved">Unresolved records</option>
                <option value="rejected">Rejected records</option>
              </select>
            </label>

            {/* <label className="dev-data-form-field">
              <span>File format</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="csv">CSV (.csv)</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </label> */}

            <label className="dev-data-form-field">
              <span>District</span>
              <select
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
              >
                <option value="all">All districts</option>
                {districts.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="dev-data-form-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="processed">Processed</option>
                <option value="review">Review</option>
                <option value="unresolved">Unresolved</option>
                <option value="rejected">Rejected</option>
                <option value="error">Error</option>
              </select>
            </label>

            <label className="dev-data-form-field">
              <span>File format</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>

            <div className="dev-data-export-fields">
              <strong>Included fields</strong>
              <label>
                <input
                  type="checkbox"
                  checked={includeOriginalAddress}
                  onChange={(event) =>
                    setIncludeOriginalAddress(event.target.checked)
                  }
                />
                Original address
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeCoordinates}
                  onChange={(event) =>
                    setIncludeCoordinates(event.target.checked)
                  }
                />
                Latitude and longitude
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeQuality}
                  onChange={(event) => setIncludeQuality(event.target.checked)}
                />
                Coordinate quality and status
              </label>
            </div>

            {error && (
              <div className="dev-records-error" role="alert">
                <AlertCircle size={19} />
                <div>
                  <strong>Export API error</strong>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {actionMessage && (
              <p role="status" className="dev-data-muted">
                {actionMessage}
              </p>
            )}

            <button
              type="button"
              className="dev-data-button primary dev-data-export-submit"
              onClick={createExport}
              disabled={creating}
            >
              {creating ? (
                <LoaderCircle size={17} className="dev-records-spinner" />
              ) : (
                <Download size={17} />
              )}
              {creating ? "Creating export…" : "Create and download export"}
            </button>
          </div>
        </section>

        <aside className="dev-data-export-aside">
          <div className="dev-data-export-aside-icon">
            <FileSpreadsheet size={25} />
          </div>
          <h3>Export database records</h3>
          <p>
            This page does not fabricate export files or export history. The
            server API must create the actual file and enforce filters.
          </p>
          <div className="dev-data-export-tip">
            <CheckCircle2 size={16} />
            Export filters should be enforced server-side.
          </div>
          <div className="dev-data-export-tip">
            <CheckCircle2 size={16} />
            Estimated coordinates should be labeled in exported data.
          </div>
          <div className="dev-data-export-tip">
            <CheckCircle2 size={16} />
            Download access should be controlled.
          </div>
        </aside>
      </div>

      <section className="dev-data-panel dev-data-export-history">
        <div className="dev-data-panel-heading">
          <div>
            <h2>Export history</h2>
            <p>Only export jobs returned by the API are shown.</p>
          </div>
          <span className="dev-data-count">
            {state === "loading" ? "Loading…" : `${exports.length} exports`}
          </span>
        </div>

        {state === "error" || state === "loading" ? (
          <DataFeedback
            state={state}
            error={error}
            emptyMessage=""
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : exports.length === 0 ? (
          <TableEmpty message="No export jobs are stored yet." />
        ) : (
          <div className="dev-data-table-wrap">
            <table className="dev-data-table">
              <thead>
                <tr>
                  <th>Export file</th>
                  <th>Format</th>
                  <th>Scope</th>
                  <th>Created</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {exports.map((item) => {
                  const filename = item.filename || `Export ${item.id}`;
                  const itemFormat = (item.format || "").toUpperCase();

                  return (
                    <tr key={String(item.id)}>
                      <td>
                        <div className="dev-data-file-cell">
                          <span className="dev-data-file-icon">
                            <FileSpreadsheet size={17} />
                          </span>
                          <div>
                            <strong>{filename}</strong>
                            <small>{String(item.id)}</small>
                          </div>
                        </div>
                      </td>
                      <td>{displayValue(itemFormat)}</td>
                      <td>{displayValue(item.scope)}</td>
                      <td className="dev-data-muted">
                        {formatDate(item.created_at)}
                      </td>
                      <td>{formatNumber(item.record_count ?? item.records)}</td>
                      <td>
                        <StatusBadge status={displayValue(item.status)} />
                      </td>
                      <td>
                        {item.download_url ? (
                          <a
                            className="dev-data-button compact"
                            href={item.download_url}
                          >
                            <Download size={14} />
                            Download
                          </a>
                        ) : (
                          <span className="dev-data-muted">Unavailable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
