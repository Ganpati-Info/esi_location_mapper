import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAvailableRecords } from "@/lib/records";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const search = p.get("search")?.trim() ?? "";
  const status = p.get("status")?.trim() ?? "";
  const district = p.get("district")?.trim() ?? "";
  const block = p.get("block")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(p.get("limit") ?? 500), 1), 2000);

  if (!db) {
    const records = await getAvailableRecords();
    const normalizedSearch = search.toLowerCase();
    const filtered = records.filter(record => {
      const matchesSearch = !normalizedSearch || Object.values(record).some(value =>
        String(value ?? "").toLowerCase().includes(normalizedSearch)
      );
      const matchesStatus = !status || record.status === status;
      const matchesDistrict = !district || record.district === district;
      const matchesBlock = !block || record.block_name === block;
      return matchesSearch && matchesStatus && matchesDistrict && matchesBlock;
    });
    return NextResponse.json({ records: filtered.slice(0, limit) });
  }

  const where: string[] = [];
  const values: string[] = [];

  if (search) {
    const q = `%${search}%`;
    where.push(`(
      original_address ILIKE $1 OR full_address ILIKE $1 OR recipient_name ILIKE $1 OR
      village_name ILIKE $1 OR landmark ILIKE $1 OR tehsil_taluka ILIKE $1 OR
      block_name ILIKE $1 OR district ILIKE $1 OR state ILIKE $1 OR
      post_office_name ILIKE $1 OR pin_code ILIKE $1 OR phone_number ILIKE $1
    )`);
    values.push(q);
  }

  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  if (district) {
    values.push(district);
    where.push(`district = $${values.length}`);
  }

  if (block) {
    values.push(block);
    where.push(`block_name = $${values.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limitParameter = values.length + 1;

  const result = await db.query(
    `SELECT * FROM location_records ${clause} ORDER BY id DESC LIMIT $${limitParameter}`,
    [...values, limit]
  );

  return NextResponse.json({ records: result.rows });
}
