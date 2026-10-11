import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const ALLOWED_STATUSES = new Set([
  "processed",
  "review",
  "unresolved",
  "rejected",
  "error",
  "problem",
]);

const ALLOWED_QUALITIES = new Set(["all", "estimated", "verified", "missing"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  if (!db) {
    return errorResponse(
      "Database is not configured. Set DATABASE_URL before using the Developer Records API.",
      503,
    );
  }

  const params = request.nextUrl.searchParams;

  const page = Math.max(1, Math.floor(Number(params.get("page") ?? 1) || 1));

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      Math.floor(
        Number(params.get("pageSize") ?? DEFAULT_PAGE_SIZE) ||
          DEFAULT_PAGE_SIZE,
      ),
    ),
  );

  const search = (params.get("search") ?? "").trim().slice(0, 200);
  const district = (params.get("district") ?? "").trim().slice(0, 100);
  const status = (params.get("status") ?? "").trim().toLowerCase();
  const quality = (params.get("quality") || "all").trim().toLowerCase();

  if (status && !ALLOWED_STATUSES.has(status)) {
    return errorResponse("Invalid status filter.", 400);
  }

  if (!ALLOWED_QUALITIES.has(quality)) {
    return errorResponse("Invalid coordinate quality filter.", 400);
  }

  const where: string[] = [];
  const values: unknown[] = [];

  function addValue(value: unknown) {
    values.push(value);
    return `$${values.length}`;
  }

  if (search) {
    const parameter = addValue(`%${search}%`);

    where.push(`(
      original_address ILIKE ${parameter}
      OR full_address ILIKE ${parameter}
      OR recipient_name ILIKE ${parameter}
      OR village_name ILIKE ${parameter}
      OR landmark ILIKE ${parameter}
      OR tehsil_taluka ILIKE ${parameter}
      OR block_name ILIKE ${parameter}
      OR district ILIKE ${parameter}
      OR state ILIKE ${parameter}
      OR post_office_name ILIKE ${parameter}
      OR pin_code ILIKE ${parameter}
      OR phone_number ILIKE ${parameter}
      OR ro_sro ILIKE ${parameter}
      OR branch_office ILIKE ${parameter}
      OR source_file_name ILIKE ${parameter}
    )`);
  }

  if (district) {
    where.push(`LOWER(BTRIM(district)) = LOWER(BTRIM(${addValue(district)}))`);
  }

  if (status === "problem") {
  where.push(`LOWER(status) IN ('rejected', 'error', 'unresolved')`);
} else if (status) {
  where.push(`LOWER(status) = ${addValue(status)}`);
}

  if (quality === "missing") {
    where.push("(latitude IS NULL OR longitude IS NULL)");
  } else if (quality === "estimated") {
    where.push(`(
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND COALESCE(geocode_provider, '') ILIKE 'gemini-estimate-unverified%'
    )`);
  } else if (quality === "verified") {
    where.push(`(
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND COALESCE(geocode_provider, '') NOT ILIKE 'gemini-estimate-unverified%'
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const countResult = await db.query<{
      total: string;
      mapped: string;
      missing: string;
      review: string;
      unresolved: string;
    }>(
      `SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        )::text AS mapped,
        COUNT(*) FILTER (
          WHERE latitude IS NULL OR longitude IS NULL
        )::text AS missing,
        COUNT(*) FILTER (
          WHERE LOWER(status) = 'review'
        )::text AS review,
        COUNT(*) FILTER (
          WHERE LOWER(status) = 'unresolved'
        )::text AS unresolved
       FROM location_records
       ${whereClause}`,
      values,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    const districtResult = await db.query<{ district: string }>(
      `SELECT DISTINCT BTRIM(district) AS district
       FROM location_records
       WHERE district IS NOT NULL
         AND BTRIM(district) <> ''
       ORDER BY district ASC
       LIMIT 500`,
    );

    const limitParameter = addValue(pageSize);
    const offsetParameter = addValue(offset);

    const recordsResult = await db.query(
      `SELECT
        id,
        original_address,
        full_address,
        recipient_name,
        village_name,
        landmark,
        tehsil_taluka,
        block_name,
        police_station_name,
        district,
        state,
        post_office_name,
        pin_code,
        phone_number,
        ro_sro,
        branch_office,
        latitude,
        longitude,
        normalization_provider,
        geocode_provider,
        confidence_score,
        status,
        error_message,
        source_row_number,
        source_file_name,
        created_at,
        updated_at
       FROM location_records
       ${whereClause}
       ORDER BY id DESC
       LIMIT ${limitParameter}
       OFFSET ${offsetParameter}`,
      [...values],
    );

    const stats = countResult.rows[0];

    return NextResponse.json(
      {
        success: true,
        records: recordsResult.rows,
        pagination: {
          page: safePage,
          pageSize,
          total,
          totalPages,
          hasPreviousPage: safePage > 1,
          hasNextPage: safePage < totalPages,
        },
        stats: {
          total: Number(stats?.total ?? 0),
          mapped: Number(stats?.mapped ?? 0),
          missing: Number(stats?.missing ?? 0),
          review: Number(stats?.review ?? 0),
          unresolved: Number(stats?.unresolved ?? 0),
        },
        filters: {
          districts: districtResult.rows
            .map((row) => row.district?.trim())
            .filter((value): value is string => Boolean(value)),
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Developer records API failed:", error);
    return errorResponse("Failed to retrieve records.", 500);
  }
}
