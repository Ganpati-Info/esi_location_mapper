import ExcelJS from "exceljs";

export interface SheetRow {
  rowNumber: number;
  values: string[];
}

export interface Mapping {
  address: number;
  phone?: number;
  recipientName?: number;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(value: string, words: string[]) {
  const h = normalizeHeader(value);
  return words.some((word) => h.includes(word));
}

export async function readFile(buffer: ArrayBuffer, filename: string): Promise<SheetRow[]> {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = Buffer.from(buffer).toString("utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line, i) => ({
      rowNumber: i + 1,
      values: line.split(",").map((v) => v.trim())
    }));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found.");

  const result: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values = Array.from({ length: row.cellCount }, (_, i) => {
      const value = row.getCell(i + 1).value;
      if (value === null || value === undefined) return "";
      if (typeof value === "object" && "result" in value) return String((value as any).result ?? "");
      return String(value).trim();
    });

    if (values.some(Boolean)) result.push({ rowNumber, values });
  });

  return result;
}

export function detectMapping(rows: SheetRow[]): { mapping: Mapping; hasHeader: boolean } {
  if (!rows.length) throw new Error("The uploaded file is empty.");

  const first = rows[0].values;

  const address = first.findIndex((v) => matches(v, [
    "address", "full address", "location", "village", "postal address", "residential address"
  ]));

  const phone = first.findIndex((v) => matches(v, [
    "phone", "mobile", "telephone", "contact", "number"
  ]));

  const recipientName = first.findIndex((v) => matches(v, [
    "recipient", "recipient name", "name", "person", "business", "customer"
  ]));

  const hasHeader = address >= 0 || phone >= 0 || recipientName >= 0;

  return {
    hasHeader,
    mapping: {
      address: address >= 0 ? address : 0,
      phone: phone >= 0 ? phone : first.length > 1 ? 1 : undefined,
      recipientName: recipientName >= 0 ? recipientName : undefined
    }
  };
}
