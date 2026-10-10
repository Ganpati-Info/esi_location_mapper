"use client";

import { useState } from "react";
import Link from "next/link";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function submit() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: form
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <section className="hero">
        <div>
          <div className="eyebrow">Upload</div>
          <h1>Process an address file</h1>
          <p>The raw address is retained. The normalized fields and geocoding result are stored beside it. Without a usable MySQL URL, processed rows are kept in local development storage.</p>
        </div>
      </section>

      <section className="card upload">
        <label htmlFor="file" className="dropzone">
          <h2>{file ? file.name : "Choose .xlsx or .csv"}</h2>
          <p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Click to select your Excel or CSV file."}</p>
          <input id="file" className="file-input" type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <div className="actions" style={{marginTop:18}}>
          <button className="btn" disabled={!file || busy} onClick={submit}>
            {busy ? "Processing..." : "Upload and process"}
          </button>
          <Link className="btn secondary" href="/">Cancel</Link>
        </div>

        {busy && (
          <div className="notice info">
            The server is normalizing and geocoding each address. Keep this tab open for the demo.
            <div className="progress"><div style={{width:"65%"}} /></div>
          </div>
        )}

        {result && (
          <div className="notice success">
            <strong>Processing finished.</strong>
            <div>Rows read: {result.rowsRead}</div>
            <div>Stored: {result.inserted}</div>
            <div>Review: {result.review}</div>
            <div>Unresolved: {result.unresolved}</div>
            <div>Errors: {result.errors}</div>
            <div style={{marginTop:8}}><Link href="/records">Open records</Link> or <Link href="/map">open map</Link>.</div>
          </div>
        )}

        {error && <div className="notice error">{error}</div>}
      </section>
    </main>
  );
}
