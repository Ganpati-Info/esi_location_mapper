import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 1000;

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!db) return errorResponse("Database is not configured.", 503);

  const { id } = await context.params;

  if (!/^\d+$/.test(id)) {
    return errorResponse("Invalid export ID.", 400);
  }

  try {
    const jobResult = await db.query<{
      filename: string;
      filters: {
        district?: string | null;
        status?: string | null;
        scope?: string;
        includeOriginalAddress?: boolean;
        includeCoordinates?: boolean;
        includeQuality?: boolean;
      };
    }>(
      `SELECT filename, filters
       FROM developer_export_jobs
       WHERE id = $1`,
      [id],
    );

    const job = jobResult.rows[0];

    if (!job) return errorResponse("Export not found.", 404);

    const filters = job.filters ?? {};
    const conditions: string[] = [];
    const values: unknown[] = [];

    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (filters.district) {
      conditions.push(
        `LOWER(BTRIM(district)) = LOWER(BTRIM(${addValue(filters.district)}))`,
      );
    }

    if (filters.status) {
      conditions.push(`LOWER(status) = ${addValue(filters.status)}`);
    }

    if (filters.scope === "review") {
      conditions.push(`LOWER(status) = 'review'`);
    } else if (filters.scope === "unresolved") {
      conditions.push(`LOWER(status) = 'unresolved'`);
    } else if (filters.scope === "rejected") {
      conditions.push(`LOWER(status) = 'rejected'`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const columns = [
      "id",
      ...(filters.includeOriginalAddress !== false ? ["original_address"] : []),
      "full_address",
      "recipient_name",
      "village_name",
      "landmark",
      "tehsil_taluka",
      "block_name",
      "police_station_name",
      "district",
      "state",
      "post_office_name",
      "pin_code",
      "phone_number",
      "ro_sro",
      "branch_office",
      ...(filters.includeCoordinates !== false
        ? ["latitude", "longitude"]
        : []),
      ...(filters.includeQuality !== false
        ? [
            "normalization_provider",
            "geocode_provider",
            "confidence_score",
            "status",
            "error_message",
          ]
        : []),
      "source_file_name",
      "source_row_number",
      "created_at",
    ];

    const encoder = new TextEncoder();
    let lastId = 0;
    let finished = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(columns.map(csvCell).join(",") + "\r\n"),
        );
      },

      async pull(controller) {
        if (finished) return;

        try {
          const batchValues = [...values];
          batchValues.push(lastId);
          const idParameter = `$${batchValues.length}`;
          batchValues.push(BATCH_SIZE);
          const limitParameter = `$${batchValues.length}`;

          const result = await db!.query(
            `SELECT ${columns.join(", ")}
             FROM location_records
             ${whereClause}
             ${whereClause ? "AND" : "WHERE"} id > ${idParameter}
             ORDER BY id ASC
             LIMIT ${limitParameter}`,
            batchValues,
          );

          if (result.rows.length === 0) {
            finished = true;
            controller.close();
            return;
          }

          const lines = result.rows.map((row) =>
            columns.map((column) => csvCell(row[column])).join(","),
          );

          lastId = Number(result.rows[result.rows.length - 1].id);

          controller.enqueue(encoder.encode(lines.join("\r\n") + "\r\n"));
        } catch (error) {
          finished = true;
          console.error("CSV download failed:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${job.filename.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Export download failed:", error);
    return errorResponse("Unable to download this export.");
  }
}
