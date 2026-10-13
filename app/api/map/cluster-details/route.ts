import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveDistrict } from "@/lib/districts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const MAX_RADIUS_KM = 20;

function numberParam(value: string | null, fallback: number) {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  if (!db)
    return NextResponse.json(
      { success: false, error: "PostgreSQL is not configured." },
      { status: 503 },
    );
  const params = request.nextUrl.searchParams;
  const district = resolveDistrict(params.get("district"));
  if (!district)
    return NextResponse.json(
      { success: false, error: "Select a valid district." },
      { status: 400 },
    );

  const latitude = numberParam(params.get("latitude"), NaN);
  const longitude = numberParam(params.get("longitude"), NaN);
  const radiusKm = Math.min(
    MAX_RADIUS_KM,
    Math.max(0.1, numberParam(params.get("radiusKm"), MAX_RADIUS_KM)),
  );
  const page = Math.max(1, Math.floor(numberParam(params.get("page"), 1)));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(numberParam(params.get("pageSize"), 10))),
  );
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      { success: false, error: "A valid cluster centre is required." },
      { status: 400 },
    );
  }

  const values: unknown[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const lat = add(latitude);
  const lng = add(longitude);
  const radius = add(radiusKm);
  const conditions = [
    `district = ${add(district)}`,
    `LOWER(BTRIM(state)) = 'west bengal'`,
    `latitude IS NOT NULL AND longitude IS NOT NULL`,
    `6371 * 2 * ASIN(SQRT(LEAST(1, POWER(SIN(RADIANS(latitude - ${lat}) / 2), 2) + COS(RADIANS(${lat})) * COS(RADIANS(latitude)) * POWER(SIN(RADIANS(longitude - ${lng}) / 2), 2)))) <= ${radius}`,
  ];
  const exactFilters: Array<[string, string]> = [
    ["block", "block_name"],
    ["tehsil", "tehsil_taluka"],
    ["branchOffice", "branch_office"],
    ["postOffice", "post_office_name"],
    ["roSro", "ro_sro"],
  ];
  for (const [param, column] of exactFilters) {
    const value = (params.get(param) ?? "").trim();
    if (value) conditions.push(`${column} = ${add(value)}`);
  }
  const search = (params.get("search") ?? "").trim().slice(0, 120);
  if (search) {
    const term = add(`%${search}%`);
    conditions.push(
      `(original_address ILIKE ${term} OR full_address ILIKE ${term} OR village_name ILIKE ${term} OR landmark ILIKE ${term} OR block_name ILIKE ${term} OR tehsil_taluka ILIKE ${term} OR post_office_name ILIKE ${term} OR branch_office ILIKE ${term} OR ro_sro ILIKE ${term} OR pin_code ILIKE ${term})`,
    );
  }

  try {
    const where = conditions.join(" AND ");
    const countResult = await db.query(
      `SELECT COUNT(*)::bigint AS total FROM location_records WHERE ${where}`,
      [...values],
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const limit = `$${values.length + 1}`;
    const offset = `$${values.length + 2}`;
    const recordValues = [...values, pageSize, (page - 1) * pageSize];
    const recordsResult = await db.query(
      `SELECT id::text AS id, original_address, full_address, village_name, landmark,
              block_name, tehsil_taluka, police_station_name, branch_office,
              post_office_name, ro_sro, district, state, latitude, longitude,
              status, geocode_provider, confidence_score
       FROM location_records WHERE ${where}
       ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
      recordValues,
    );
    return NextResponse.json(
      {
        success: true,
        district,
        centre: { latitude, longitude },
        radiusKm,
        page,
        pageSize,
        total,
        records: recordsResult.rows,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Cluster detail query failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load cluster records." },
      { status: 500 },
    );
  }
}
