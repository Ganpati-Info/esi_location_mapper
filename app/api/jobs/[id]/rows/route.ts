import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!db) {
    return NextResponse.json(
      { success: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
    const { id } = await context.params;
    const jobId = Number(id);

    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid upload job ID." },
        { status: 400 },
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") ?? "1", 10) || 1,
    );

    const requestedLimit = Number.parseInt(
      searchParams.get("limit") ?? "25",
      10,
    );

    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 25),
    );

    const status = searchParams.get("status");

    const allowedStatuses = [
      "pending",
      "processing",
      "completed",
      "review",
      "unresolved",
      "error",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid row status.",
          allowedStatuses,
        },
        { status: 400 },
      );
    }

    const jobResult = await db.query(
      `
      SELECT id, file_name, total_rows, status
      FROM upload_jobs
      WHERE id = $1
      `,
      [jobId],
    );

    const job = jobResult.rows[0];

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Upload job not found." },
        { status: 404 },
      );
    }

    const offset = (page - 1) * limit;

    const values: unknown[] = [jobId];
    let statusFilter = "";

    if (status) {
      values.push(status);
      statusFilter = `AND processing_status = $${values.length}`;
    }

    values.push(limit, offset);

    const recordsResult = await db.query(
      `
      SELECT
        id,
        source_row_number,
        original_address,
        ro_sro,
        branch_office,
        phone_number,
        recipient_name,
        source_file_name,
        source_row_data,
        processing_status,
        error_message,
        attempts,
        location_record_id,
        locked_at,
        created_at,
        updated_at
      FROM upload_job_rows
      WHERE upload_job_id = $1
        ${statusFilter}
      ORDER BY source_row_number ASC, id ASC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
      values,
    );

    const countValues: unknown[] = [jobId];

    let countStatusFilter = "";

    if (status) {
      countValues.push(status);
      countStatusFilter = `AND processing_status = $${countValues.length}`;
    }

    const countResult = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM upload_job_rows
      WHERE upload_job_id = $1
        ${countStatusFilter}
      `,
      countValues,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);

    return NextResponse.json({
      success: true,
      job: {
        id: Number(job.id),
        fileName: job.file_name,
        totalRows: Number(job.total_rows),
        status: job.status,
      },
      records: recordsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Failed to retrieve upload rows:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve upload rows.",
      },
      { status: 500 },
    );
  }
}
