import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "resolved",
] as const;

export async function GET(request: NextRequest) {
  if (!db) {
    return NextResponse.json(
      { success: false, error: "Database is not configured." },
      { status: 503 },
    );
  }

  try {
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

    const status = searchParams.get("status") ?? "pending";

    if (
      !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid review status.",
          allowedStatuses: ALLOWED_STATUSES,
        },
        { status: 400 },
      );
    }

    const offset = (page - 1) * limit;

    const [recordsResult, countResult] = await Promise.all([
      db.query(
        `SELECT
          id,
          original_address,
          ro_sro,
          branch_office,
          candidate_locality,
          candidate_post_office,
          candidate_police_station,
          candidate_block,
          candidate_district,
          candidate_state,
          candidate_pin_code,
          candidate_latitude,
          candidate_longitude,
          review_category,
          review_reason,
          review_status,
          processing_attempts,
          source_row_number,
          source_file_name,
          created_at,
          updated_at
        FROM location_review_records
        WHERE review_status = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
        [status, limit, offset],
      ),

      db.query(
        `SELECT COUNT(*)::int AS total
         FROM location_review_records
         WHERE review_status = $1`,
        [status],
      ),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);

    return NextResponse.json({
      success: true,
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
    console.error("Failed to retrieve review records:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve review records.",
      },
      { status: 500 },
    );
  }
}
