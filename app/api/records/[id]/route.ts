import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAvailableRecords } from "@/lib/records";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!db) {
    const records = await getAvailableRecords();
    const record = records.find(item => item.id === Number(id));
    return record
      ? NextResponse.json({ record })
      : NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const [rows] = await db.query("SELECT * FROM location_records WHERE id = ?", [id]);
  const record = (rows as any[])[0];

  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  return NextResponse.json({ record });
}
