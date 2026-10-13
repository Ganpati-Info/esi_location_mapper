import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MAP_POINTS = 1500;
const MAX_CLUSTER_POINTS = 3000;
const MAX_CLUSTER_SOURCE_ROWS = 50000;
const CLUSTER_RADIUS_KM = 20;
const INDIVIDUAL_POINT_ZOOM = 10;

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
     * LOWER ZOOM: fixed-centre geographic clusters. Every record assigned
     * to a cluster is within 20 km of that cluster's centre. We cap source
     * rows to protect the API; hasMore warns when the viewport exceeds cap.
     */
    const sourceLimit = add(MAX_CLUSTER_SOURCE_ROWS + 1);
    const result = await db.query(
      `SELECT
         id::text AS id, original_address, full_address, village_name, landmark,
         block_name, tehsil_taluka, police_station_name, branch_office,
         post_office_name, ro_sro, district, state, latitude, longitude,
         status, geocode_provider, confidence_score
       FROM location_records
       WHERE ${whereSql}
       ORDER BY id
       LIMIT ${sourceLimit}`,
      values,
    );

    const sourceHasMore = result.rows.length > MAX_CLUSTER_SOURCE_ROWS;
    const sourceRows = result.rows.slice(0, MAX_CLUSTER_SOURCE_ROWS) as Array<Record<string, any>>;
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = radians(bLat - aLat);
      const dLng = radians(bLng - aLng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    };

    type Cluster = {
      id: string; district: string; latitude: number; longitude: number; count: number;
      estimated_count: number; review_count: number; status: string; geocode_provider: string;
      confidence_score: number | null; block_name: string | null; tehsil_taluka: string | null;
      branch_office: string | null; post_office_name: string | null; ro_sro: string | null;
      village_name: string | null;
    };
    const clusters: Cluster[] = [];
    // 20 km is about 0.18 degrees latitude; spatial buckets reduce comparisons.
    const bucketSize = 0.18;
    const buckets = new Map<string, number[]>();
    const bucketKey = (lat: number, lng: number) => `${Math.floor(lat / bucketSize)}:${Math.floor(lng / bucketSize)}`;

    for (const row of sourceRows) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const by = Math.floor(lat / bucketSize);
      const bx = Math.floor(lng / bucketSize);
      let match: Cluster | undefined;
      for (let dy = -2; dy <= 2 && !match; dy++) {
        for (let dx = -2; dx <= 2 && !match; dx++) {
          for (const idx of buckets.get(`${by + dy}:${bx + dx}`) ?? []) {
            const candidate = clusters[idx];
            if (distanceKm(lat, lng, candidate.latitude, candidate.longitude) <= CLUSTER_RADIUS_KM) {
              match = candidate;
              break;
            }
          }
        }
      }
      if (!match) {
        const cluster: Cluster = {
          id: `cluster:${lat.toFixed(6)}:${lng.toFixed(6)}`,
          district: String(row.district ?? district), latitude: lat, longitude: lng, count: 0,
          estimated_count: 0, review_count: 0, status: String(row.status ?? 'mixed'),
          geocode_provider: 'cluster', confidence_score: null,
          block_name: null, tehsil_taluka: null, branch_office: null, post_office_name: null,
          ro_sro: null, village_name: null,
        };
        clusters.push(cluster);
        const idx = clusters.length - 1;
        const key = bucketKey(lat, lng);
        buckets.set(key, [...(buckets.get(key) ?? []), idx]);
        match = cluster;
      }
      match.count++;
      if (String(row.geocode_provider ?? '').startsWith('gemini-estimate-unverified')) match.estimated_count++;
      if (String(row.status ?? '').toLowerCase() === 'review') match.review_count++;
      if (match.count === 1) {
        match.status = String(row.status ?? 'mapped');
        match.geocode_provider = String(row.geocode_provider ?? 'cluster');
        match.confidence_score = row.confidence_score == null ? null : Number(row.confidence_score);
        match.block_name = row.block_name ?? null;
        match.tehsil_taluka = row.tehsil_taluka ?? null;
        match.branch_office = row.branch_office ?? null;
        match.post_office_name = row.post_office_name ?? null;
        match.ro_sro = row.ro_sro ?? null;
        match.village_name = row.village_name ?? null;
      } else {
        if (match.status !== String(row.status ?? 'mapped')) match.status = 'mixed';
        if (String(row.geocode_provider ?? '').startsWith('gemini-estimate-unverified')) match.geocode_provider = 'gemini-estimate-unverified:cluster';
        if (match.block_name !== (row.block_name ?? null)) match.block_name = null;
        if (match.tehsil_taluka !== (row.tehsil_taluka ?? null)) match.tehsil_taluka = null;
        if (match.branch_office !== (row.branch_office ?? null)) match.branch_office = null;
        if (match.post_office_name !== (row.post_office_name ?? null)) match.post_office_name = null;
        if (match.ro_sro !== (row.ro_sro ?? null)) match.ro_sro = null;
        if (match.village_name !== (row.village_name ?? null)) match.village_name = null;
      }
    }

    clusters.sort((a, b) => b.count - a.count);
    const points = clusters.slice(0, MAX_CLUSTER_POINTS);
    return NextResponse.json(
      { success: true, district, mode: "clusters", clusterRadiusKm: CLUSTER_RADIUS_KM,
        points, returned: points.length, hasMore: sourceHasMore || clusters.length > MAX_CLUSTER_POINTS,
        maxPoints: MAX_CLUSTER_POINTS, sourceRowsProcessed: sourceRows.length, viewport: bounds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(`Map query failed for district ${district}:`, error);

    return jsonError(
      "Unable to retrieve map data. Check the server logs for details.",
      500,
    );
  }
}
