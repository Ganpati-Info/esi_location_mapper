import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    return NextResponse.json(
      {
        success: false,
        error: "Database is not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await db.query(
      `SELECT
         id,
         file_name,
         total_rows,
         processed_rows,
         review_rows,
         unresolved_rows,
         error_rows,
         status,
         last_processed_row,
         error_message,
         created_at,
         updated_at
       FROM upload_jobs
       ORDER BY created_at DESC, id DESC`,
    );

    const jobs = result.rows.map((row) => ({
      id: row.id,
      filename: row.file_name,
      source_file_name: row.file_name,
      total_rows: Number(row.total_rows ?? 0),
      processed_rows: Number(row.processed_rows ?? 0),
      review_rows: Number(row.review_rows ?? 0),
      unresolved_rows: Number(row.unresolved_rows ?? 0),
      error_rows: Number(row.error_rows ?? 0),
      status: row.status,
      last_processed_row: row.last_processed_row,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return NextResponse.json(
      {
        success: true,
        jobs,
        stats: {
          total: jobs.length,
          completed: jobs.filter(
            (job) => String(job.status).toLowerCase() === "completed",
          ).length,
          failed: jobs.filter((job) =>
            ["failed", "error"].includes(String(job.status).toLowerCase()),
          ).length,
          needsReview: jobs.filter((job) => Number(job.review_rows) > 0).length,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Developer jobs API failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve import jobs from the database.",
      },
      { status: 500 },
    );
  }
}
