import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "processed",
  "review",
  "unresolved",
  "rejected",
  "error",
]);

const ALLOWED_SCOPES = new Set([
  "all",
  "filtered",
  "review",
  "unresolved",
  "rejected",
]);

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function buildFilters(filters: {
  scope: string;
  district: string | null;
  status: string | null;
}) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  function addValue(value: unknown) {
    values.push(value);
    return `$${values.length}`;
  }

  if (filters.district) {
    conditions.push(
      `LOWER(BTRIM(district)) = LOWER(BTRIM(${addValue(filters.district)}))`,
    );
  }

  if (filters.status) {
    conditions.push(`LOWER(status) = ${addValue(filters.status)}`);
  }

  if (filters.scope === "review") {
    conditions.push("LOWER(status) = 'review'");
  } else if (filters.scope === "unresolved") {
    conditions.push("LOWER(status) = 'unresolved'");
  } else if (filters.scope === "rejected") {
    conditions.push("LOWER(status) = 'rejected'");
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

// GET /api/developer/exports
// Return real export history and available districts.
export async function GET() {
  if (!db) {
    return errorResponse("Database is not configured.", 503);
  }

  try {
    const [historyResult, districtResult] = await Promise.all([
      db.query(
        `SELECT
           id,
           filename,
           format,
           scope,
           record_count,
           status,
           created_at
         FROM developer_export_jobs
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
      ),
      db.query<{ district: string }>(
        `SELECT DISTINCT BTRIM(district) AS district
         FROM location_records
         WHERE district IS NOT NULL
           AND BTRIM(district) <> ''
         ORDER BY district ASC
         LIMIT 500`,
      ),
    ]);

    return NextResponse.json(
      {
        success: true,
        exports: historyResult.rows.map((row) => ({
          ...row,
          id: String(row.id),
          record_count: Number(row.record_count ?? 0),
          download_url: `/api/developer/exports/${row.id}/download`,
        })),
        filters: {
          districts: districtResult.rows.map((row) => row.district),
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Load export history failed:", error);
    return errorResponse(
      "Unable to load export history. Check that the export history table exists.",
    );
  }
}

// POST /api/developer/exports
// Create a real export job based on database records.
export async function POST(request: NextRequest) {
  if (!db) {
    return errorResponse("Database is not configured.", 503);
  }

  try {
    const body = await request.json();

    const format = String(body.format ?? "csv").toLowerCase();
    const scope = String(body.scope ?? "all").toLowerCase();

    const district = body.district
      ? String(body.district).trim().slice(0, 100)
      : null;

    const status = body.status
      ? String(body.status).trim().toLowerCase()
      : null;

    if (format !== "csv") {
      return errorResponse("Only CSV export is currently supported.", 400);
    }

    if (!ALLOWED_SCOPES.has(scope)) {
      return errorResponse("Invalid export scope.", 400);
    }

    if (status && !ALLOWED_STATUSES.has(status)) {
      return errorResponse("Invalid status filter.", 400);
    }

    const filters = { scope, district, status };
    const { where, values } = buildFilters(filters);

    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM location_records
       ${where}`,
      values,
    );

    const recordCount = Number(countResult.rows[0]?.total ?? 0);
    const filename = `location-records-${Date.now()}.csv`;

    const savedFilters = {
      ...filters,
      includeOriginalAddress: body.includeOriginalAddress !== false,
      includeCoordinates: body.includeCoordinates !== false,
      includeQuality: body.includeQuality !== false,
    };

    const insertResult = await db.query(
      `INSERT INTO developer_export_jobs
         (filename, format, scope, filters, record_count, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING
         id,
         filename,
         format,
         scope,
         record_count,
         status,
         created_at`,
      [
        filename,
        format,
        scope,
        JSON.stringify(savedFilters),
        recordCount,
        "completed",
      ],
    );

    const job = insertResult.rows[0];

    const downloadUrl = `/api/developer/exports/${job.id}/download`;

    return NextResponse.json({
      success: true,
      message: "Export job created.",
      exports: [
        {
          ...job,
          id: String(job.id),
          record_count: Number(job.record_count),
          download_url: downloadUrl,
        },
      ],
      download_url: downloadUrl,
    });
  } catch (error) {
    console.error("Create export failed:", error);
    return errorResponse(
      "Unable to create export. Check the database schema and server logs.",
    );
  }
}
