"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  RotateCcw,
} from "lucide-react";

import { resolveDistrict } from "@/lib/districts";
import type { LocationRecord } from "@/types";

const PAGE_SIZE = 50;

type RecordsResponse = {
  district?: string;
  records?: LocationRecord[];
  total?: number;
  error?: string;
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function qualityLabel(record: LocationRecord): string {
  const latitude = record.latitude;
  const longitude = record.longitude;

  if (latitude == null || longitude == null) {
    return "Unresolved";
  }

  const provider = String(
    (record as LocationRecord & { geocode_provider?: string })
      .geocode_provider ?? "",
  ).toLowerCase();

  if (
    provider.includes("gemini") ||
    provider.includes("estimate") ||
    provider.includes("approx")
  ) {
    return "Estimated";
  }

  return "Coordinates available";
}

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export default function RecordsTable() {
  const searchParams = useSearchParams();
  const district = resolveDistrict(searchParams.get("district"));

  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Debounce text search and reset pagination when filters change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
  }, [district, status]);

  useEffect(() => {
    if (!district) {
      setRecords([]);
      setTotal(0);
      setError("Select a valid West Bengal district to view records.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadRecords() {
      setLoading(true);
      setError("");

      const query = new URLSearchParams({
        district,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });

      if (search) query.set("search", search);
      if (status) query.set("status", status);

      try {
        const response = await fetch(`/api/records?${query.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const data = (await response.json()) as RecordsResponse;

        if (!response.ok) {
          throw new Error(data.error || "Failed to load records.");
        }

        // Fail closed if the API response is not for the selected district.
        if (
          !data.district ||
          data.district.toLowerCase() !== district.toLowerCase()
        ) {
          throw new Error(
            "The server returned an unexpected district. Records were not displayed.",
          );
        }

        setRecords(data.records ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setRecords([]);
        setTotal(0);
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while loading records.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadRecords();

    return () => controller.abort();
  }, [district, search, status, offset]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRecord = total === 0 ? 0 : offset + 1;
  const lastRecord = Math.min(offset + records.length, total);

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setOffset(0);
  }

  return (
    <section className="records-panel panel">
      <div className="records-panel-heading panel-heading">
        <div>
          <div className="panel-kicker">DISTRICT DATASET</div>
          <h2>{district ? `${district} records` : "Location records"}</h2>
          <p className="panel-subtitle">
            Only records assigned to {district || "the selected district"} in
            West Bengal are shown.
          </p>
        </div>

        <span className="records-result-count" aria-live="polite">
          {total.toLocaleString("en-IN")} records
        </span>
      </div>

      <div className="records-toolbar">
        <label className="records-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search address, locality, block or PIN..."
            aria-label="Search district records"
          />
        </label>

        <label className="records-status-filter">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="processed">Processed</option>
            <option value="review">Review</option>
            <option value="unresolved">Unresolved</option>
            <option value="error">Error</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <button
          type="button"
          className="button button-secondary records-reset-button"
          onClick={resetFilters}
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {error ? (
        <div className="records-error" role="alert">
          <strong>Records could not be loaded</strong>
          <p>{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setOffset((current) => current)}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="records-loading" role="status">
          <LoaderCircle size={18} className="records-spinner" />
          Loading {district} records…
        </div>
      ) : records.length === 0 ? (
        <div className="records-empty">
          <strong>No records found</strong>
          <span>
            There are no matching records in {district}. Try changing your
            search or status filter.
          </span>
        </div>
      ) : (
        <div className="records-table-scroll">
          <table className="data-table records-data-table">
            <thead>
              <tr>
                <th>Original address</th>
                <th>Locality / village</th>
                <th>Block</th>
                <th>District</th>
                <th>State</th>
                <th>Post office</th>
                <th>PIN</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Coordinate quality</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="record-address-cell">
                    <strong>{display(record.original_address)}</strong>
                  </td>
                  <td>{display(record.village_name)}</td>
                  <td>{display(record.block_name)}</td>
                  <td>{display(record.district)}</td>
                  <td>{display(record.state)}</td>
                  <td>{display(record.post_office_name)}</td>
                  <td>{display(record.pin_code)}</td>
                  <td>{display(record.latitude)}</td>
                  <td>{display(record.longitude)}</td>
                  <td>
                    <span
                      className={`coordinate-quality coordinate-quality-${statusClass(
                        qualityLabel(record),
                      )}`}
                    >
                      {qualityLabel(record)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${statusClass(
                        String(record.status ?? "unknown"),
                      )}`}
                    >
                      {display(record.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="records-table-footer">
        <span>
          Showing {firstRecord.toLocaleString("en-IN")}–
          {lastRecord.toLocaleString("en-IN")} of{" "}
          {total.toLocaleString("en-IN")} {district} records
        </span>

        <div className="records-pagination">
          <button
            type="button"
            className="button button-secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <span>
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            className="button button-secondary"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </section>
  );
}
