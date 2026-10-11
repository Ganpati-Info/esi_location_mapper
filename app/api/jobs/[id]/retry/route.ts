import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  if (!db) {
    return NextResponse.json(
      { success: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const jobId = Number(id);

  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid upload job ID." },
      { status: 400 },
    );
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const jobResult = await client.query(
      `
      SELECT id, status
      FROM upload_jobs
      WHERE id = $1
      FOR UPDATE
      `,
      [jobId],
    );

    if (jobResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { success: false, error: "Upload job not found." },
        { status: 404 },
      );
    }

    const retryResult = await client.query(
      `
      UPDATE upload_job_rows
      SET
        processing_status = 'pending',
        attempts = 0,
        error_message = NULL,
        locked_at = NULL,
        updated_at = NOW()
      WHERE upload_job_id = $1
        AND processing_status = 'error'
      RETURNING id
      `,
      [jobId],
    );

    if (retryResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          success: false,
          error: "This job has no failed rows to retry.",
        },
        { status: 409 },
      );
    }

    await client.query(
      `
      UPDATE upload_jobs
      SET
        status = 'pending',
        error_message = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [jobId],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Failed rows have been requeued.",
      jobId,
      rowsRequeued: retryResult.rowCount ?? 0,
      status: "pending",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Failed to retry upload job:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retry failed rows.",
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
