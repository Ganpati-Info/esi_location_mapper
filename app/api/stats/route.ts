import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAvailableRecords } from "@/lib/records";

export async function GET() {
  if (!db) {
    const records = await getAvailableRecords();
    const processed = records.filter(record => record.status === "processed").length;
    const review = records.filter(record => record.status === "review").length;
    const unresolved = records.filter(record => record.status === "unresolved").length;
    const mapped = records.filter(record => record.latitude !== null && record.longitude !== null).length;
    return NextResponse.json({
      stats: {
        total: records.length,
        processed,
        review,
        unresolved,
        mapped
      },
      districts: []
    });
  }

  const statsResult = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'processed') AS processed,
      COUNT(*) FILTER (WHERE status = 'review') AS review,
      COUNT(*) FILTER (WHERE status = 'unresolved') AS unresolved,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS mapped
    FROM location_records
  `);

  const districtResult = await db.query(`
    SELECT district, COUNT(*) AS count
    FROM location_records
    WHERE district IS NOT NULL AND district <> ''
    GROUP BY district
    ORDER BY count DESC
    LIMIT 10
  `);

  return NextResponse.json({
    stats: statsResult.rows[0],
    districts: districtResult.rows
  });
}
