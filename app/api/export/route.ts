import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAvailableRecords } from "@/lib/records";
import type { LocationRecord } from "@/types";

export async function GET() {
  const data: LocationRecord[] = db
    ? (await db.query<LocationRecord>(
        "SELECT * FROM location_records ORDER BY id"
      )).rows
    : await getAvailableRecords();

  const headers: Array<keyof LocationRecord> = [
    "id","original_address","full_address","recipient_name","village_name","landmark",
    "tehsil_taluka","block_name","district","state","post_office_name","pin_code",
    "phone_number","latitude","longitude","normalization_provider","geocode_provider",
    "confidence_score","status","error_message","source_row_number","source_file_name"
  ];

  const csv = [
    headers.join(","),
    ...data.map(row => headers.map(header => {
      const value = row[header] ?? "";
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(","))
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="location-connect-records.csv"'
    }
  });
}
