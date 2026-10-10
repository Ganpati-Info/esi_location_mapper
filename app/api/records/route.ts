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
  const values: unknown[] = [];

  if (search) {
    const q = `%${search}%`;
    where.push(`(
      original_address LIKE ? OR full_address LIKE ? OR recipient_name LIKE ? OR
      village_name LIKE ? OR landmark LIKE ? OR tehsil_taluka LIKE ? OR
      block_name LIKE ? OR district LIKE ? OR state LIKE ? OR
      post_office_name LIKE ? OR pin_code LIKE ? OR phone_number LIKE ?
    )`);
    values.push(q,q,q,q,q,q,q,q,q,q,q,q);
  }

  if (status) {
    where.push("status = ?");
    values.push(status);
  }

  if (district) {
    where.push("district = ?");
    values.push(district);
  }

  if (block) {
    where.push("block_name = ?");
    values.push(block);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.query(
    `SELECT * FROM location_records ${clause} ORDER BY id DESC LIMIT ?`,
    [...values, limit]
  );

  return NextResponse.json({ records: rows });
}
