"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Info,
  LoaderCircle,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

type UploadResponse = {
  success: boolean;
  error?: string;
  message?: string;
  rowsRead?: number;
  addressesQueued?: number;
  rowsWithoutAddress?: number;
  detectedColumns?: Record<string, string | null>;
  job?: {
    id: number | string;
    fileName: string;
    status: string;
    totalRows: number;
  };
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function UploadClient() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResponse | null>(null);

  function chooseFile(candidate?: File) {
    setError("");
    setResult(null);

    if (!candidate) return;

    const extension = candidate.name.split(".").pop()?.toLowerCase();

    if (!["xlsx", "xlsm", "csv"].includes(extension ?? "")) {
      setFile(null);
      setError("Choose an Excel (.xlsx, .xlsm) or CSV (.csv) file.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("This file exceeds 25 MB. Please choose a smaller file.");
      return;
    }

    setFile(candidate);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  async function uploadFile() {
    if (!file || uploading) return;

    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const body = (await response.json()) as UploadResponse;

      if (!response.ok || !body.success || !body.job) {
        throw new Error(body.error || "Unable to upload this file.");
      }

      setResult(body);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong during upload.",
      );
    } finally {
      setUploading(false);
    }
  }

  function resetUpload() {
    setFile(null);
    setResult(null);
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="workspace-page upload-page">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <FileUp size={14} />
            DATA INGESTION
          </div>

          <h1>Upload location data</h1>

          <p>
            Import your spreadsheet, preserve its original rows, and send
            address records into the processing queue.
          </p>
        </div>

        <Link href="/jobs" className="button button-secondary">
          View processing jobs
          <ArrowRight size={16} />
        </Link>
      </section>

      <div className="upload-layout">
        <section className="panel upload-main-panel">
          {result?.job ? (
            <div className="upload-success">
              <div className="upload-success-icon">
                <CheckCircle2 size={31} />
              </div>

              <span className="panel-kicker">UPLOAD ACCEPTED</span>
              <h2>Your file is in the queue.</h2>

              <p>
                The spreadsheet was accepted. Address processing happens
                separately in the background, so this does not mean every
                location has already been resolved.
              </p>

              <div className="upload-summary-grid">
                <div>
                  <span>Rows read</span>
                  <strong>
                    {(result.rowsRead ?? 0).toLocaleString("en-IN")}
                  </strong>
                </div>

                <div>
                  <span>Addresses queued</span>
                  <strong>
                    {(result.addressesQueued ?? 0).toLocaleString("en-IN")}
                  </strong>
                </div>

                <div>
                  <span>Without an address</span>
                  <strong>
                    {(result.rowsWithoutAddress ?? 0).toLocaleString("en-IN")}
                  </strong>
                </div>
              </div>

              <div className="uploaded-file-summary">
                <FileSpreadsheet size={21} />
                <div>
                  <strong>{result.job.fileName}</strong>
                  <span>Job ID: {result.job.id}</span>
                </div>
              </div>

              <div className="upload-success-actions">
                <Link
                  href={`/jobs/${result.job.id}`}
                  className="button button-primary"
                >
                  Monitor processing
                  <ArrowRight size={16} />
                </Link>

                <button
                  type="button"
                  onClick={resetUpload}
                  className="button button-secondary"
                >
                  Upload another file
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">STEP 01</span>
                  <h2>Select your spreadsheet</h2>
                  <p className="panel-subtitle">
                    Start with an Excel workbook or a CSV file.
                  </p>
                </div>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                onChange={onFileChange}
                hidden
              />

              <div
                className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${
                  file ? "has-file" : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <div className="upload-dropzone-icon">
                  {file ? <FileSpreadsheet size={29} /> : <Upload size={29} />}
                </div>

                {file ? (
                  <>
                    <h3>{file.name}</h3>
                    <p>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to
                      upload
                    </p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => inputRef.current?.click()}
                    >
                      Choose a different file
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Drop your file here</h3>
                    <p>or select a file from your computer</p>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => inputRef.current?.click()}
                    >
                      Browse files
                    </button>
                    <span className="upload-file-hint">
                      XLSX, XLSM or CSV · Maximum 25 MB
                    </span>
                  </>
                )}
              </div>

              {error && (
                <div className="inline-alert inline-alert-error" role="alert">
                  <XCircle size={19} />
                  <p>{error}</p>
                </div>
              )}

              <div className="upload-form-footer">
                <div className="upload-privacy-note">
                  <ShieldCheck size={18} />
                  <span>Original row data is retained for traceability.</span>
                </div>

                <button
                  type="button"
                  className="button button-primary"
                  disabled={!file || uploading}
                  onClick={() => void uploadFile()}
                >
                  {uploading ? (
                    <>
                      <LoaderCircle size={17} className="spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload size={17} />
                      Upload and queue
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="upload-side-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">BEFORE YOU UPLOAD</span>
                <h2>Spreadsheet checklist</h2>
              </div>
              <Info size={20} className="muted-icon" />
            </div>

            <ul className="upload-checklist">
              <li>
                <CheckCircle2 size={17} />
                Include a column containing the full address.
              </li>
              <li>
                <CheckCircle2 size={17} />
                Keep original source columns and identifiers intact.
              </li>
              <li>
                <CheckCircle2 size={17} />
                Include PIN codes or locality details when available.
              </li>
              <li>
                <CheckCircle2 size={17} />
                Use a header row when possible.
              </li>
            </ul>
          </section>

          <section className="upload-process-card">
            <div className="process-card-icon">
              <ShieldCheck size={23} />
            </div>

            <h3>How processing works</h3>

            <div className="mini-process-step">
              <span>01</span>
              <div>
                <strong>Upload & preserve</strong>
                <p>The source rows are stored in the processing queue.</p>
              </div>
            </div>

            <div className="mini-process-step">
              <span>02</span>
              <div>
                <strong>Resolve & validate</strong>
                <p>Configured location providers enrich address data.</p>
              </div>
            </div>

            <div className="mini-process-step">
              <span>03</span>
              <div>
                <strong>Review uncertain results</strong>
                <p>Uncertain records are separated for human review.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
