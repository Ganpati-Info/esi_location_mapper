import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export interface SheetRow {
  rowNumber: number;
  values: string[];
}

export interface Mapping {
  address: number;
  phone?: number;
  recipientName?: number;
  roSro?: number;
  branchOffice?: number;
}

export interface DetectedWorkbook {
  mapping: Mapping;
  hasHeader: boolean;
  headers: string[];
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeader(
  headers: string[],
  exactMatches: string[],
  partialMatches: string[] = [],
): number {
  const normalized = headers.map(normalizeHeader);
  const exact = new Set(exactMatches.map(normalizeHeader));

  // Prefer exact header matches to prevent ambiguous mappings.
  const exactIndex = normalized.findIndex((header) => exact.has(header));

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return normalized.findIndex((header) =>
    partialMatches.some((candidate) => header.includes(candidate)),
  );
}

function cellToString(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("result" in value) {
      return cellToString(value.result as ExcelJS.CellValue);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }

    if ("hyperlink" in value && typeof value.text === "string") {
      return value.text.trim();
    }
  }

  return "";
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value.trim());

  return values;
}

function parseCsv(text: string): SheetRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: SheetRow[] = [];

  let currentLine = "";
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!currentLine) {
      startLine = i + 1;
    }

    currentLine += currentLine ? `\n${line}` : line;

    const quoteCount = (currentLine.match(/"/g) ?? []).length;

    // A CSV field may contain a newline inside quoted text.
    if (quoteCount % 2 !== 0) {
      continue;
    }

    if (currentLine.trim()) {
      const values = splitCsvLine(currentLine);

      if (values.some(Boolean)) {
        rows.push({
          rowNumber: startLine,
          values,
        });
      }
    }

    currentLine = "";
  }

  if (currentLine.trim()) {
    throw new Error("The CSV file has an unclosed quoted field.");
  }

  return rows;
}

export async function readFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<SheetRow[]> {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = Buffer.from(buffer).toString("utf8");
    return parseCsv(text);
  }

  const workbook = new ExcelJS.Workbook();

  try {
    const workbookBuffer = Buffer.from(buffer) as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0];
    await workbook.xlsx.load(workbookBuffer);
  } catch (error) {
    console.error("Excel workbook parsing failed:", error);

    throw new Error(
      "Unable to read this Excel workbook. Please open it in Excel and save it as .xlsx, then upload it again.",
    );
  }

  const sheet =
    workbook.worksheets.find((worksheet) => worksheet.rowCount > 0) ??
    workbook.worksheets[0] ??
    workbook.getWorksheet(1);

  if (!sheet) {
    console.error(
      "ExcelJS found no worksheets.",
      JSON.stringify({
        worksheetCount: workbook.worksheets.length,
        sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
      }),
    );

    throw new Error(
      "No worksheet found in the uploaded Excel file. Please check that the workbook contains a worksheet and save it again as .xlsx.",
    );
  }

  const result: SheetRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    const values = Array.from({ length: row.cellCount }, (_, index) =>
      cellToString(row.getCell(index + 1).value),
    );

    if (values.some((value) => value.length > 0)) {
      result.push({
        rowNumber,
        values,
      });
    }
  });

  return result;
}

export function detectMapping(rows: SheetRow[]): DetectedWorkbook {
  if (rows.length === 0) {
    throw new Error("The uploaded file is empty.");
  }

  const headers = rows[0].values;

  // The known IP_Address column takes priority over generic address labels.
  const address = findHeader(
    headers,
    [
      "IP_Address",
      "IP Address",
      "Full Address",
      "Postal Address",
      "Residential Address",
      "Delivery Address",
      "Address",
      "Location",
    ],
    [
      "full address",
      "postal address",
      "residential address",
      "delivery address",
      "ip address",
    ],
  );

  const phone = findHeader(
    headers,
    ["Phone", "Phone Number", "Mobile", "Mobile Number", "Telephone"],
    ["phone", "mobile", "telephone"],
  );

  const recipientName = findHeader(
    headers,
    ["Recipient Name", "Customer Name", "Person Name", "Contact Name", "Name"],
    ["recipient name", "customer name", "contact name"],
  );

  const roSro = findHeader(
    headers,
    ["RO_SRO", "RO SRO", "RO/SRO", "Regional Office", "SRO"],
    ["ro sro", "regional office"],
  );

  const branchOffice = findHeader(
    headers,
    ["Branch_office", "Branch Office", "Branch"],
    ["branch office"],
  );

  const hasHeader =
    address >= 0 ||
    phone >= 0 ||
    recipientName >= 0 ||
    roSro >= 0 ||
    branchOffice >= 0;

  if (address < 0 && hasHeader) {
    throw new Error(
      `Could not identify the address column. Detected headers: ${headers
        .filter(Boolean)
        .join(", ")}. Expected a column such as IP_Address or Address.`,
    );
  }

  if (address < 0 && !hasHeader) {
    throw new Error(
      "The file has no recognizable address header. Please add an IP_Address or Address column.",
    );
  }

  return {
    hasHeader,
    headers,
    mapping: {
      address,
      phone: phone >= 0 ? phone : undefined,
      recipientName: recipientName >= 0 ? recipientName : undefined,
      roSro: roSro >= 0 ? roSro : undefined,
      branchOffice: branchOffice >= 0 ? branchOffice : undefined,
    },
  };
}
