import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAvailableRecords } from "@/lib/records";
import { resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 100;

function isWestBengal(value: unknown): boolean {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() === "west bengal"
  );
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const requestedDistrict = params.get("district");
  const district = resolveDistrict(requestedDistrict);

  // Never allow an unscoped records query from the district workspace.
  if (!district) {
    return NextResponse.json(
      {
        error: "A valid West Bengal district is required.",
        records: [],
      },
      { status: 400 },
    );
  }

  const search = (params.get("search") ?? "").trim().slice(0, 200);
  const status = (params.get("status") ?? "").trim().toLowerCase();
  const block = (params.get("block") ?? "").trim().slice(0, 150);

  const parsedLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const parsedOffset = Number.parseInt(params.get("offset") ?? "", 10);

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), PAGE_SIZE_MAX)
    : PAGE_SIZE_DEFAULT;

  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const allowedStatuses = new Set([
    "processed",
    "review",
    "unresolved",
    "error",
    "rejected",
  ]);

  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json(
      { error: "Invalid status filter.", records: [] },
      { status: 400 },
    );
  }

  try {
    /*
     * Fallback mode: apply the same mandatory district and state
     * restrictions before search, filters, counts, and pagination.
     */
    if (!db) {
      const available = await getAvailableRecords();

      const filtered = available.filter((record) => {
        if (normalize(record.district) !== normalize(district)) {
          return false;
        }

        if (!isWestBengal(record.state)) {
          return false;
        }

        if (status && normalize(record.status) !== status) {
          return false;
        }

        if (block && normalize(record.block_name) !== normalize(block)) {
          return false;
        }

        if (search) {
          const searchable = [
            record.original_address,
            record.full_address,
            record.recipient_name,
            record.village_name,
            record.landmark,
            record.tehsil_taluka,
            record.block_name,
            record.post_office_name,
            record.pin_code,
            record.phone_number,
          ]
            .map(normalize)
            .join(" ");

          if (!searchable.includes(normalize(search))) {
            return false;
          }
        }

        return true;
      });

      return NextResponse.json({
        district,
        total: filtered.length,
        limit,
        offset,
        records: filtered.slice(offset, offset + limit),
      });
    }

    const values: unknown[] = [];

    function addValue(value: unknown): string {
      values.push(value);
      return `$${values.length}`;
    }

    // These conditions are mandatory, not optional filters.
    const conditions = [
      `LOWER(BTRIM(COALESCE(district, ''))) = LOWER(${addValue(district)})`,
      `LOWER(BTRIM(COALESCE(state, ''))) = 'west bengal'`,
    ];

    if (status) {
      conditions.push(
        `LOWER(BTRIM(COALESCE(status, ''))) = ${addValue(status)}`,
      );
    }

    if (block) {
      conditions.push(
        `LOWER(BTRIM(COALESCE(block_name, ''))) = LOWER(${addValue(block)})`,
      );
    }

    if (search) {
      const searchParam = addValue(`%${search}%`);

      conditions.push(`(
        original_address ILIKE ${searchParam}
        OR full_address ILIKE ${searchParam}
        OR recipient_name ILIKE ${searchParam}
        OR village_name ILIKE ${searchParam}
        OR landmark ILIKE ${searchParam}
        OR tehsil_taluka ILIKE ${searchParam}
        OR block_name ILIKE ${searchParam}
        OR post_office_name ILIKE ${searchParam}
        OR pin_code ILIKE ${searchParam}
        OR phone_number ILIKE ${searchParam}
      )`);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await db.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM location_records
        WHERE ${whereClause}
      `,
      values,
    );

    const pageValues = [...values];
    pageValues.push(limit);
    const limitParam = `$${pageValues.length}`;

    pageValues.push(offset);
    const offsetParam = `$${pageValues.length}`;

    const recordsResult = await db.query(
      `
        SELECT
          id,
          original_address,
          full_address,
          recipient_name,
          village_name,
          landmark,
          tehsil_taluka,
          block_name,
          district,
          state,
          post_office_name,
          pin_code,
          phone_number,
          latitude,
          longitude,
          normalization_provider,
          geocode_provider,
          confidence_score,
          status,
          error_message,
          source_row_number,
          source_file_name
        FROM location_records
        WHERE ${whereClause}
        ORDER BY id DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      pageValues,
    );

    return NextResponse.json({
      district,
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
      records: recordsResult.rows,
    });
  } catch (error) {
    console.error("District-scoped records query failed:", error);

    return NextResponse.json(
      { error: "Unable to load records for this district." },
      { status: 500 },
    );
  }
}
