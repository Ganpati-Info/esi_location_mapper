import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MAP_POINTS = 1500;
const MAX_CLUSTER_POINTS = 3000;
const INDIVIDUAL_POINT_ZOOM = 14;

const WEST_BENGAL_BOUNDS = {
  west: 85.4,
  south: 21.3,
  east: 89.9,
  north: 27.5,
};

type MapQueryOptions = {
  district: string;
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
  search: string;
  block: string;
  tehsil: string;
  branchOffice: string;
  postOffice: string;
  roSro: string;
};

function parseNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Restrict the requested geographic window to a broad
 * West Bengal bounding rectangle.
 *
 * The selected district and resolved state are still checked
 * independently in SQL. This rectangle is not the exact state
 * boundary and is not a substitute for geographic validation.
 */
function intersectWestBengal(
  options: MapQueryOptions,
): Pick<MapQueryOptions, "west" | "south" | "east" | "north"> | null {
  const west = Math.max(options.west, WEST_BENGAL_BOUNDS.west);

  const south = Math.max(options.south, WEST_BENGAL_BOUNDS.south);

  const east = Math.min(options.east, WEST_BENGAL_BOUNDS.east);

  const north = Math.min(options.north, WEST_BENGAL_BOUNDS.north);

  if (west >= east || south >= north) {
    return null;
  }

  return { west, south, east, north };
}

/**
 * Request filters are parameterized values.
 *
 * Only explicitly defined database columns are accepted.
 */
function buildWhereClause(
  options: MapQueryOptions,
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  },
) {
  const values: unknown[] = [];

  function add(value: unknown): string {
    values.push(value);
    return `$${values.length}`;
  }

  const conditions = [
    `district = ${add(options.district)}`,

    `LOWER(BTRIM(state)) = 'west bengal'`,

    "latitude IS NOT NULL",
    "longitude IS NOT NULL",

    `latitude >= ${add(bounds.south)}`,
    `latitude <= ${add(bounds.north)}`,

    `longitude >= ${add(bounds.west)}`,
    `longitude <= ${add(bounds.east)}`,
  ];

  if (options.block) {
    conditions.push(`block_name = ${add(options.block)}`);
  }

  if (options.tehsil) {
    conditions.push(`tehsil_taluka = ${add(options.tehsil)}`);
  }

  if (options.branchOffice) {
    conditions.push(`branch_office = ${add(options.branchOffice)}`);
  }

  if (options.postOffice) {
    conditions.push(`post_office_name = ${add(options.postOffice)}`);
  }

  if (options.roSro) {
    conditions.push(`ro_sro = ${add(options.roSro)}`);
  }

  if (options.search) {
    const searchValue = `%${options.search}%`;
    const searchParameter = add(searchValue);

    conditions.push(`
      (
        original_address ILIKE ${searchParameter}
        OR full_address ILIKE ${searchParameter}
        OR village_name ILIKE ${searchParameter}
        OR landmark ILIKE ${searchParameter}
        OR block_name ILIKE ${searchParameter}
        OR tehsil_taluka ILIKE ${searchParameter}
        OR post_office_name ILIKE ${searchParameter}
        OR branch_office ILIKE ${searchParameter}
        OR ro_sro ILIKE ${searchParameter}
        OR pin_code ILIKE ${searchParameter}
      )
    `);
  }

  return {
    whereSql: conditions.join("\n AND "),
    values,
    add,
  };
}

/**
 * Select how aggressively to cluster records.
 *
 * Rounded coordinates are grid cells for visualization,
 * not verified geographic locations.
 */
function getClusterPrecision(zoom: number): number {
  if (zoom <= 5) return 1;
  if (zoom <= 7) return 2;
  if (zoom <= 9) return 3;

  return 4;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      points: [],
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  if (!db) {
    return jsonError("PostgreSQL is not configured.", 503);
  }

  const params = request.nextUrl.searchParams;

  const district = resolveDistrict(params.get("district"));

  if (!district) {
    return jsonError(
      "Select a valid West Bengal district before opening the map.",
      400,
    );
  }

  const zoomValue = parseNumber(params.get("zoom"), 7);

  const zoom = Math.min(20, Math.max(3, Math.round(zoomValue)));

  const search = (params.get("search") ?? "").trim().slice(0, 120);

  const options: MapQueryOptions = {
    district,
    west: parseNumber(params.get("west"), WEST_BENGAL_BOUNDS.west),
    south: parseNumber(params.get("south"), WEST_BENGAL_BOUNDS.south),
    east: parseNumber(params.get("east"), WEST_BENGAL_BOUNDS.east),
    north: parseNumber(params.get("north"), WEST_BENGAL_BOUNDS.north),
    zoom,
    search,

    block: (params.get("block") ?? "").trim(),
    tehsil: (params.get("tehsil") ?? "").trim(),

    branchOffice: (params.get("branchOffice") ?? "").trim(),

    postOffice: (params.get("postOffice") ?? "").trim(),

    roSro: (params.get("roSro") ?? "").trim(),
  };

  if (
    ![options.west, options.south, options.east, options.north].every(
      Number.isFinite,
    ) ||
    options.west >= options.east ||
    options.south >= options.north
  ) {
    return jsonError("The map viewport is invalid.", 400);
  }

  const bounds = intersectWestBengal(options);

  if (!bounds) {
    return NextResponse.json({
      success: true,
      district,
      mode: zoom >= INDIVIDUAL_POINT_ZOOM ? "points" : "clusters",
      points: [],
      hasMore: false,
      message:
        "The current viewport contains no area within the West Bengal map bounds.",
    });
  }

  try {
    const { whereSql, values, add } = buildWhereClause(options, bounds);

    /*
     * HIGH ZOOM:
     * Return individual locations for detailed inspection.
     *
     * Fetch one extra row to tell the client whether more
     * locations exist in the current viewport.
     */
    if (zoom >= INDIVIDUAL_POINT_ZOOM) {
      const limitParameter = add(MAX_MAP_POINTS + 1);

      const result = await db.query(
        `
          SELECT
            id::text AS id,
            original_address,
            village_name,
            landmark,
            block_name,
            tehsil_taluka,
            police_station_name,
            branch_office,
            post_office_name,
            ro_sro,
            district,
            state,
            latitude,
            longitude,
            status,
            geocode_provider,
            confidence_score

          FROM location_records

          WHERE ${whereSql}

          ORDER BY id

          LIMIT ${limitParameter}
        `,
        values,
      );

      const hasMore = result.rows.length > MAX_MAP_POINTS;

      const points = result.rows.slice(0, MAX_MAP_POINTS);

      return NextResponse.json(
        {
          success: true,
          district,
          mode: "points",
          points,
          returned: points.length,
          hasMore,
          maxPoints: MAX_MAP_POINTS,
          viewport: bounds,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    /*
     * LOWER ZOOM:
     * Aggregate records into coordinate grid cells.
     *
     * This keeps the response smaller than returning
     * thousands of overlapping markers.
     */
    const precision = getClusterPrecision(zoom);

    const precisionParameter = add(precision);

    const limitParameter = add(MAX_CLUSTER_POINTS + 1);

    const result = await db.query(
      `
        SELECT
          MIN(id)::text AS id,

          district,

          AVG(latitude)::double precision
            AS latitude,

          AVG(longitude)::double precision
            AS longitude,

          COUNT(*)::integer
            AS count,

          COUNT(*) FILTER (
            WHERE geocode_provider
              LIKE 'gemini-estimate-unverified%'
          )::integer AS estimated_count,

          COUNT(*) FILTER (
            WHERE status = 'review'
          )::integer AS review_count,

          CASE
            WHEN COUNT(DISTINCT block_name) = 1
            THEN MIN(block_name)
            ELSE NULL
          END AS block_name,

          CASE
            WHEN COUNT(DISTINCT tehsil_taluka) = 1
            THEN MIN(tehsil_taluka)
            ELSE NULL
          END AS tehsil_taluka,

          CASE
            WHEN COUNT(DISTINCT branch_office) = 1
            THEN MIN(branch_office)
            ELSE NULL
          END AS branch_office,

          CASE
            WHEN COUNT(DISTINCT post_office_name) = 1
            THEN MIN(post_office_name)
            ELSE NULL
          END AS post_office_name,

          CASE
            WHEN COUNT(DISTINCT ro_sro) = 1
            THEN MIN(ro_sro)
            ELSE NULL
          END AS ro_sro,

          CASE
            WHEN COUNT(DISTINCT village_name) = 1
            THEN MIN(village_name)
            ELSE NULL
          END AS village_name,

          CASE
            WHEN COUNT(DISTINCT status) = 1
            THEN MIN(status)
            ELSE 'mixed'
          END AS status,

          CASE
            WHEN COUNT(*) FILTER (
              WHERE geocode_provider
                LIKE 'gemini-estimate-unverified%'
            ) > 0
            THEN 'gemini-estimate-unverified:cluster'
            ELSE 'cluster'
          END AS geocode_provider,

          AVG(confidence_score)::double precision
            AS confidence_score

        FROM location_records

        WHERE ${whereSql}

        GROUP BY
          district,
          ROUND(latitude::numeric, ${precisionParameter}),
          ROUND(longitude::numeric, ${precisionParameter})

        ORDER BY COUNT(*) DESC

        LIMIT ${limitParameter}
      `,
      values,
    );

    const hasMore = result.rows.length > MAX_CLUSTER_POINTS;

    const points = result.rows.slice(0, MAX_CLUSTER_POINTS);

    return NextResponse.json(
      {
        success: true,
        district,
        mode: "clusters",
        precision,
        points,
        returned: points.length,
        hasMore,
        maxPoints: MAX_CLUSTER_POINTS,
        viewport: bounds,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error(`Map query failed for district ${district}:`, error);

    return jsonError(
      "Unable to retrieve map data. Check the server logs for details.",
      500,
    );
  }
}
