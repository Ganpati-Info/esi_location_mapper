import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_OPTIONS = 500;

const FILTER_COLUMNS = {
  blocks: "block_name",
  tehsils: "tehsil_taluka",
  villages: "village_name",
  branchOffices: "branch_office",
  postOffices: "post_office_name",
  roSros: "ro_sro",
} as const;

type FilterKey = keyof typeof FILTER_COLUMNS;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  if (!db) {
    return errorResponse("PostgreSQL is not configured.", 503);
  }

  const params = request.nextUrl.searchParams;
  const district = (params.get("district") ?? "").trim();
  const block = (params.get("block") ?? "").trim();
  const tehsil = (params.get("tehsil") ?? "").trim();

  try {
    const districtResult = await db.query<{ value: string }>(
      `SELECT DISTINCT BTRIM(district) AS value
       FROM location_records
       WHERE LOWER(BTRIM(state)) = 'west bengal'
         AND district IS NOT NULL
         AND BTRIM(district) <> ''
       ORDER BY value ASC
       LIMIT 50`,
    );

    // Build filter values separately for each query. This avoids
    // parameter-index collisions when queries run concurrently.
    async function getDistinctValues(key: FilterKey): Promise<string[]> {
      const column = FILTER_COLUMNS[key];
      const values: string[] = [];
      const conditions = [
        "LOWER(BTRIM(state)) = 'west bengal'",
        `${column} IS NOT NULL`,
        `BTRIM(${column}) <> ''`,
      ];

      function add(value: string): string {
        values.push(value);
        return `$${values.length}`;
      }

      if (district) {
        conditions.push(
          `LOWER(BTRIM(district)) = LOWER(BTRIM(${add(district)}))`,
        );
      }

      if (block) {
        conditions.push(
          `LOWER(BTRIM(block_name)) = LOWER(BTRIM(${add(block)}))`,
        );
      }

      if (tehsil) {
        conditions.push(
          `LOWER(BTRIM(tehsil_taluka)) = LOWER(BTRIM(${add(tehsil)}))`,
        );
      }

      const limitParameter = `$${values.length + 1}`;

      const result = await db!.query<{ value: string }>(
        `SELECT DISTINCT BTRIM(${column}) AS value
         FROM location_records
         WHERE ${conditions.join(" AND ")}
         ORDER BY value ASC
         LIMIT ${limitParameter}`,
        [...values, String(MAX_OPTIONS)],
      );

      return result.rows
        .map((row) => row.value?.trim())
        .filter((value): value is string => Boolean(value));
    }

    const keys = Object.keys(FILTER_COLUMNS) as FilterKey[];
    const optionArrays = await Promise.all(
      keys.map((key) => getDistinctValues(key)),
    );

    const filters: Record<string, string[]> = {
      districts: districtResult.rows
        .map((row) => row.value?.trim())
        .filter((value): value is string => Boolean(value)),
    };

    keys.forEach((key, index) => {
      filters[key] = optionArrays[index];
    });

    return NextResponse.json(
      { success: true, filters },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Developer filters API failed:", error);
    return errorResponse("Unable to load statewide filter options.", 500);
  }
}
