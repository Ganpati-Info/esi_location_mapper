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
    const [
      recordsResult,
      reviewResult,
      jobsResult,
      districtsResult,
      recentJobsResult,
    ] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'processed')::int AS processed,
          COUNT(*) FILTER (WHERE status = 'review')::int AS review,
          COUNT(*) FILTER (WHERE status = 'unresolved')::int AS unresolved,
          COUNT(*) FILTER (
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
          )::int AS mapped
        FROM location_records
      `),

      db.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE review_status = 'pending'
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE review_status = 'approved'
          )::int AS approved,
          COUNT(*) FILTER (
            WHERE review_status = 'rejected'
          )::int AS rejected,
          COUNT(*) FILTER (
            WHERE review_status = 'resolved'
          )::int AS resolved
        FROM location_review_records
      `),

      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status IN ('pending', 'processing')
          )::int AS active,
          COUNT(*) FILTER (
            WHERE status = 'completed'
          )::int AS completed,
          COUNT(*) FILTER (
            WHERE status = 'failed'
          )::int AS failed
        FROM upload_jobs
      `),

      db.query(`
        SELECT COUNT(DISTINCT LOWER(TRIM(district)))::int AS total
        FROM location_records
        WHERE district IS NOT NULL
          AND TRIM(district) <> ''
      `),

      db.query(`
        SELECT
          id,
          file_name,
          total_rows,
          processed_rows,
          review_rows,
          unresolved_rows,
          error_rows,
          status,
          created_at,
          updated_at
        FROM upload_jobs
        ORDER BY created_at DESC, id DESC
        LIMIT 6
      `),
    ]);

    return NextResponse.json({
      success: true,
      records: recordsResult.rows[0],
      reviews: reviewResult.rows[0],
      jobs: jobsResult.rows[0],
      districts: districtsResult.rows[0].total,
      recentJobs: recentJobsResult.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard statistics failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load dashboard statistics.",
      },
      { status: 500 },
    );
  }
}
