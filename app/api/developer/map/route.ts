import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_POINTS = 1500;
const MAX_CLUSTERS = 3000;

const STATE_BOUNDS = {
  west: 85.4,
  south: 21.3,
  east: 89.9,
  north: 27.5,
};

type Options = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
  district: string;
  block: string;
  tehsil: string;
  village: string;
  branchOffice: string;
  postOffice: string;
  roSro: string;
  status: string;
  quality: string;
  search: string;
};

function numberParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function fail(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message, points: [] },
    { status },
  );
}

function clusterPrecision(zoom: number) {
  if (zoom <= 5) return 1;
  if (zoom <= 7) return 2;
  if (zoom <= 9) return 3;
  return 4;
}

export async function GET(request: NextRequest) {
  if (!db) return fail("PostgreSQL is not configured.", 503);

  const params = request.nextUrl.searchParams;

  const options: Options = {
    west: numberParam(params.get("west"), STATE_BOUNDS.west),
    south: numberParam(params.get("south"), STATE_BOUNDS.south),
    east: numberParam(params.get("east"), STATE_BOUNDS.east),
    north: numberParam(params.get("north"), STATE_BOUNDS.north),
    zoom: Math.max(
      3,
      Math.min(20, Math.round(numberParam(params.get("zoom"), 6))),
    ),
    district: (params.get("district") ?? "").trim(),
    block: (params.get("block") ?? "").trim(),
    tehsil: (params.get("tehsil") ?? "").trim(),
    village: (params.get("village") ?? "").trim(),
    branchOffice: (params.get("branchOffice") ?? "").trim(),
    postOffice: (params.get("postOffice") ?? "").trim(),
    roSro: (params.get("roSro") ?? "").trim(),
    status: (params.get("status") ?? "").trim().toLowerCase(),
    quality: (params.get("quality") ?? "").trim().toLowerCase(),
    search: (params.get("search") ?? "").trim().slice(0, 120),
  };

  if (
    ![options.west, options.south, options.east, options.north].every(
      Number.isFinite,
    ) ||
    options.west >= options.east ||
    options.south >= options.north
  ) {
    return fail("Invalid map viewport.", 400);
  }

  // Restrict the requested viewport to the application's broad WB bounds.
  const bounds = {
    west: Math.max(options.west, STATE_BOUNDS.west),
    south: Math.max(options.south, STATE_BOUNDS.south),
    east: Math.min(options.east, STATE_BOUNDS.east),
    north: Math.min(options.north, STATE_BOUNDS.north),
  };

  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    return NextResponse.json({
      success: true,
      mode: "clusters",
      points: [],
      returned: 0,
      hasMore: false,
    });
  }

  try {
    const values: unknown[] = [];

    function add(value: unknown) {
      values.push(value);
      return `$${values.length}`;
    }

    const conditions = [
      "LOWER(BTRIM(state)) = 'west bengal'",
      "latitude IS NOT NULL",
      "longitude IS NOT NULL",
      "latitude BETWEEN " + add(bounds.south) + " AND " + add(bounds.north),
      "longitude BETWEEN " + add(bounds.west) + " AND " + add(bounds.east),
    ];

    if (options.district) {
      conditions.push(
        `LOWER(BTRIM(district)) = LOWER(BTRIM(${add(options.district)}))`,
      );
    }
    if (options.block) {
      conditions.push(
        `LOWER(BTRIM(block_name)) = LOWER(BTRIM(${add(options.block)}))`,
      );
    }
    if (options.tehsil) {
      conditions.push(
        `LOWER(BTRIM(tehsil_taluka)) = LOWER(BTRIM(${add(options.tehsil)}))`,
      );
    }
    if (options.village) {
      conditions.push(
        `LOWER(BTRIM(village_name)) = LOWER(BTRIM(${add(options.village)}))`,
      );
    }
    if (options.branchOffice) {
      conditions.push(
        `LOWER(BTRIM(branch_office)) = LOWER(BTRIM(${add(options.branchOffice)}))`,
      );
    }
    if (options.postOffice) {
      conditions.push(
        `LOWER(BTRIM(post_office_name)) = LOWER(BTRIM(${add(options.postOffice)}))`,
      );
    }
    if (options.roSro) {
      conditions.push(
        `LOWER(BTRIM(ro_sro)) = LOWER(BTRIM(${add(options.roSro)}))`,
      );
    }

    const allowedStatuses = [
      "processed",
      "review",
      "unresolved",
      "rejected",
      "error",
    ];
    if (options.status && allowedStatuses.includes(options.status)) {
      if (options.status === "unresolved") {
        conditions.push(
          "(status = 'unresolved' OR latitude IS NULL OR longitude IS NULL)",
        );
      } else {
        conditions.push(`LOWER(BTRIM(status)) = ${add(options.status)}`);
      }
    }

    if (options.quality === "estimated") {
      conditions.push("geocode_provider LIKE 'gemini-estimate-unverified%'");
    } else if (options.quality === "other") {
      conditions.push(
        "(geocode_provider IS NULL OR geocode_provider NOT LIKE 'gemini-estimate-unverified%')",
      );
    }

    if (options.search) {
      const pattern = add(`%${options.search}%`);
      conditions.push(`(
        original_address ILIKE ${pattern}
        OR full_address ILIKE ${pattern}
        OR village_name ILIKE ${pattern}
        OR landmark ILIKE ${pattern}
        OR district ILIKE ${pattern}
        OR block_name ILIKE ${pattern}
        OR tehsil_taluka ILIKE ${pattern}
        OR post_office_name ILIKE ${pattern}
        OR branch_office ILIKE ${pattern}
        OR ro_sro ILIKE ${pattern}
        OR pin_code ILIKE ${pattern}
      )`);
    }

    // Missing coordinates cannot be drawn as map markers.
    // They remain accessible from the records/review pages.
    if (options.quality === "missing") {
      return NextResponse.json({
        success: true,
        mode: "points",
        points: [],
        returned: 0,
        hasMore: false,
        message: "Records without coordinates cannot be plotted on the map.",
      });
    }

    const whereSql = conditions.join("\n AND ");

    if (options.zoom >= 14) {
      const limit = add(MAX_POINTS + 1);

      const result = await db.query(
        `SELECT
           id::text AS id,
           original_address,
           full_address,
           village_name,
           landmark,
           block_name,
           tehsil_taluka,
           police_station_name,
           branch_office,
           post_office_name,
           ro_sro,
           pin_code,
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
         LIMIT ${limit}`,
        values,
      );

      const hasMore = result.rows.length > MAX_POINTS;
      const points = result.rows.slice(0, MAX_POINTS);

      return NextResponse.json(
        {
          success: true,
          mode: "points",
          points,
          returned: points.length,
          hasMore,
          maxPoints: MAX_POINTS,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const precision = clusterPrecision(options.zoom);
    const precisionParam = add(precision);
    const limit = add(MAX_CLUSTERS + 1);

    const result = await db.query(
      `SELECT
         MIN(id)::text AS id,
         MIN(district) AS district,
         AVG(latitude)::double precision AS latitude,
         AVG(longitude)::double precision AS longitude,
         COUNT(*)::integer AS count,
         COUNT(*) FILTER (
           WHERE geocode_provider LIKE 'gemini-estimate-unverified%'
         )::integer AS estimated_count,
         COUNT(*) FILTER (WHERE status = 'review')::integer AS review_count,
         CASE WHEN COUNT(DISTINCT block_name) = 1 THEN MIN(block_name) END AS block_name,
         CASE WHEN COUNT(DISTINCT tehsil_taluka) = 1 THEN MIN(tehsil_taluka) END AS tehsil_taluka,
         CASE WHEN COUNT(DISTINCT village_name) = 1 THEN MIN(village_name) END AS village_name,
         CASE WHEN COUNT(DISTINCT branch_office) = 1 THEN MIN(branch_office) END AS branch_office,
         CASE WHEN COUNT(DISTINCT post_office_name) = 1 THEN MIN(post_office_name) END AS post_office_name,
         CASE WHEN COUNT(DISTINCT ro_sro) = 1 THEN MIN(ro_sro) END AS ro_sro,
         CASE WHEN COUNT(DISTINCT status) = 1 THEN MIN(status) ELSE 'mixed' END AS status,
         CASE
           WHEN COUNT(*) FILTER (
             WHERE geocode_provider LIKE 'gemini-estimate-unverified%'
           ) > 0
           THEN 'gemini-estimate-unverified:cluster'
           ELSE 'cluster'
         END AS geocode_provider,
         AVG(confidence_score)::double precision AS confidence_score
       FROM location_records
       WHERE ${whereSql}
       GROUP BY
         ROUND(latitude::numeric, ${precisionParam}),
         ROUND(longitude::numeric, ${precisionParam})
       ORDER BY COUNT(*) DESC
       LIMIT ${limit}`,
      values,
    );

    const hasMore = result.rows.length > MAX_CLUSTERS;
    const points = result.rows.slice(0, MAX_CLUSTERS);

    return NextResponse.json(
      {
        success: true,
        mode: "clusters",
        points,
        returned: points.length,
        hasMore,
        maxPoints: MAX_CLUSTERS,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Developer map API failed:", error);
    return fail(
      "Unable to retrieve statewide map data. Check server logs.",
      500,
    );
  }
}
