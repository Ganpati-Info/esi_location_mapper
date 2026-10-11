import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OPTIONS_PER_FILTER = 500;

type FilterOption = {
  value: string;
};

type FilterOptions = {
  blocks: string[];
  tehsils: string[];
  branchOffices: string[];
  postOffices: string[];
  roSros: string[];
};

/**
 * Database columns are explicitly allow-listed.
 * Never interpolate arbitrary client-supplied column names into SQL.
 */
const FILTER_QUERIES = {
  blocks: "block_name",
  tehsils: "tehsil_taluka",
  branchOffices: "branch_office",
  postOffices: "post_office_name",
  roSros: "ro_sro",
} as const;

type FilterKey = keyof typeof FILTER_QUERIES;

/**
 * Retrieve distinct, non-empty values for one filter field.
 *
 * Every query is constrained to the selected district and
 * records whose resolved state is West Bengal.
 */
async function getDistinctValues(
  column: (typeof FILTER_QUERIES)[FilterKey],
  district: string,
): Promise<string[]> {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  // column comes exclusively from the server-side allow-list above.
  const result = await db.query<FilterOption>(
    `
      SELECT DISTINCT BTRIM(${column}) AS value
      FROM location_records
      WHERE district = $1
        AND LOWER(BTRIM(state)) = 'west bengal'
        AND ${column} IS NOT NULL
        AND BTRIM(${column}) <> ''
      ORDER BY value ASC
      LIMIT $2
    `,
    [district, MAX_OPTIONS_PER_FILTER],
  );

  return result.rows
    .map((row) => row.value?.trim())
    .filter((value): value is string => Boolean(value));
}

export async function GET(request: NextRequest) {
  const requestedDistrict = request.nextUrl.searchParams.get("district");

  const district = resolveDistrict(requestedDistrict);

  if (!district) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid West Bengal district is required.",
      },
      { status: 400 },
    );
  }

  if (!db) {
    return NextResponse.json(
      {
        success: false,
        error: "PostgreSQL is not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const [blocks, tehsils, branchOffices, postOffices, roSros] =
      await Promise.all([
        getDistinctValues(FILTER_QUERIES.blocks, district),

        getDistinctValues(FILTER_QUERIES.tehsils, district),

        getDistinctValues(FILTER_QUERIES.branchOffices, district),

        getDistinctValues(FILTER_QUERIES.postOffices, district),

        getDistinctValues(FILTER_QUERIES.roSros, district),
      ]);

    const filters: FilterOptions = {
      blocks,
      tehsils,
      branchOffices,
      postOffices,
      roSros,
    };

    return NextResponse.json(
      {
        success: true,
        district,
        filters,
        limits: {
          maxOptionsPerFilter: MAX_OPTIONS_PER_FILTER,
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error(`Failed to load filters for ${district}:`, error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load filters for the selected district.",
      },
      { status: 500 },
    );
  }
}
