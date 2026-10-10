import path from "node:path";
import ExcelJS from "exceljs";
import type { LocationRecord } from "@/types";

let sampleRecordsPromise: Promise<LocationRecord[]> | undefined;

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && "text" in value) return value.text;
  return String(value);
}

async function loadSampleRecords(): Promise<LocationRecord[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(process.cwd(), "sample.xlsx"));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("sample.xlsx does not contain a worksheet.");

  const rows = worksheet.getRows(1, worksheet.rowCount) ?? [];
  return rows
    .filter(Boolean)
    .map((row, index) => {
      const currentRow = row!;
      const originalAddress = cellText(currentRow.getCell(1).value) ?? "";
      const phone = cellText(currentRow.getCell(2).value);
      const timestamp = new Date(0).toISOString();

      return {
        id: index + 1,
        original_address: originalAddress,
        full_address: null,
        recipient_name: null,
        village_name: null,
        landmark: null,
        tehsil_taluka: null,
        block_name: null,
        district: null,
        state: null,
        post_office_name: null,
        pin_code: null,
        phone_number: phone,
        latitude: null,
        longitude: null,
        normalization_provider: null,
        geocode_provider: null,
        confidence_score: 0,
        status: "unresolved",
        error_message: "Sample workbook record; not processed without database and Mappls configuration.",
        source_row_number: index + 1,
        source_file_name: "sample.xlsx",
        created_at: timestamp,
        updated_at: timestamp
      };
    });
}

export function getSampleRecords(): Promise<LocationRecord[]> {
  sampleRecordsPromise ??= loadSampleRecords();
  return sampleRecordsPromise;
}
