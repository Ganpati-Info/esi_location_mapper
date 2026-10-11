import { NextRequest, NextResponse } from "next/server";
import { getUploadJob } from "@/lib/job-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const jobId = Number(id);

    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid upload job ID.",
        },
        { status: 400 },
      );
    }

    const job = await getUploadJob(jobId);

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: "Upload job not found.",
        },
        { status: 404 },
      );
    }

    const totalRows = Number(job.total_rows ?? 0);
    const processedRows = Number(job.processed_rows ?? 0);
    const reviewRows = Number(job.review_rows ?? 0);
    const unresolvedRows = Number(job.unresolved_rows ?? 0);
    const errorRows = Number(job.error_rows ?? 0);

    const completedRows =
      processedRows + reviewRows + unresolvedRows + errorRows;

    const progress =
      totalRows === 0
        ? 100
        : Math.min(100, Math.round((completedRows / totalRows) * 100));

    return NextResponse.json({
      success: true,
      job: {
        id: Number(job.id),
        fileName: job.file_name,
        status: job.status,
        totalRows,
        processedRows,
        reviewRows,
        unresolvedRows,
        errorRows,
        completedRows,
        progress,
        lastProcessedRow: Number(job.last_processed_row ?? 0),
        errorMessage: job.error_message ?? null,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to fetch upload job:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve upload job progress.",
      },
      { status: 500 },
    );
  }
}
