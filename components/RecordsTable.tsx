"use client";

import { useEffect, useState } from "react";
import type { LocationRecord } from "@/types";

function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{value}</span>;
}

export default function RecordsTable() {
  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({ limit: "1000" });
      if (search) query.set("search", search);
      if (status) query.set("status", status);

      const response = await fetch(`/api/records?${query}`);
      const data = await response.json();
      setRecords(data.records ?? []);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [search, status]);

  return (
    <>
      <div className="card toolbar">
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address, village, block, district, PIN, phone..." />
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="processed">Processed</option>
          <option value="review">Review</option>
          <option value="unresolved">Unresolved</option>
          <option value="error">Error</option>
        </select>
        <a className="btn secondary" href="/api/export">Export CSV</a>
      </div>

      <div className="card table-wrap">
        {loading ? <p style={{padding:20}}>Loading...</p> : (
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Original</th><th>Full address</th><th>Recipient</th>
                <th>Village</th><th>Landmark</th><th>Tehsil/Taluka</th><th>Block</th>
                <th>District</th><th>State</th><th>Post Office</th><th>PIN</th>
                <th>Phone</th><th>Latitude</th><th>Longitude</th><th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.original_address}</td>
                  <td>{r.full_address ?? "-"}</td>
                  <td>{r.recipient_name ?? "-"}</td>
                  <td>{r.village_name ?? "-"}</td>
                  <td>{r.landmark ?? "-"}</td>
                  <td>{r.tehsil_taluka ?? "-"}</td>
                  <td>{r.block_name ?? "-"}</td>
                  <td>{r.district ?? "-"}</td>
                  <td>{r.state ?? "-"}</td>
                  <td>{r.post_office_name ?? "-"}</td>
                  <td>{r.pin_code ?? "-"}</td>
                  <td>{r.phone_number ?? "-"}</td>
                  <td>{r.latitude ?? "-"}</td>
                  <td>{r.longitude ?? "-"}</td>
                  <td>{r.confidence_score ?? 0}%</td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
              {!records.length && <tr><td colSpan={17}>No records found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
