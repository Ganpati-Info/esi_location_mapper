import { NextRequest, NextResponse } from "next/server";
import { readFile, detectMapping } from "@/lib/excel";
import { createUploadJob, type QueueRowInput } from "@/lib/job-queue";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cell(values: string[], index: number | undefined): string | null {
  if (index === undefined) {
    return null;
  }

  return values[index]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json(
        {
          success: false,
          error:
            "DATABASE_URL is not configured. Persistent uploads require PostgreSQL.",
        },
        { status: 503 },
      );
    }

    if (!process.env.MAPPLS_ACCESS_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error:
            "MAPPLS_ACCESS_TOKEN is not configured. Configure Mappls before uploading.",
        },
        { status: 500 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Please upload an .xlsx, .xlsm, or .csv file.",
        },
        { status: 400 },
      );
    }

    const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "The uploaded file is empty." },
        { status: 400 },
      );
    }

    if (file.size > maxMb * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximum upload size is ${maxMb} MB.`,
        },
        { status: 400 },
      );
    }

    const filename = file.name;
    const extension = filename.toLowerCase().split(".").pop();

    if (!["xlsx", "xlsm", "csv"].includes(extension ?? "")) {
      return NextResponse.json(
        {
          success: false,
          error: "Only .xlsx, .xlsm, and .csv files are supported.",
        },
        { status: 400 },
      );
    }

    const rows = await readFile(await file.arrayBuffer(), filename);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The uploaded file contains no non-empty rows.",
        },
        { status: 400 },
      );
    }

    const detected = detectMapping(rows);

    // Preserve the parser's actual row numbers.
    const dataRows = detected.hasHeader
      ? rows.filter((row) => row.rowNumber !== rows[0].rowNumber)
      : rows;

    const queueRows = dataRows.reduce<QueueRowInput[]>((queue, row) => {
        const address = cell(row.values, detected.mapping.address);

        if (!address) {
          return queue;
        }

        // Keep every original column, including columns not
        // recognized by the automatic mapping.
        const sourceRowData: Record<string, unknown> = {};

        row.values.forEach((value, index) => {
          const header = detected.hasHeader
            ? detected.headers[index]?.trim()
            : undefined;

          const key = header || `column_${index + 1}`;

          // Avoid overwriting duplicate or blank column names.
          const uniqueKey =
            sourceRowData[key] === undefined ? key : `${key}_${index + 1}`;

          sourceRowData[uniqueKey] = value;
        });

        queue.push({
          sourceRowNumber: row.rowNumber,
          originalAddress: address,
          roSro: cell(row.values, detected.mapping.roSro),
          branchOffice: cell(row.values, detected.mapping.branchOffice),
          phoneNumber: cell(row.values, detected.mapping.phone),
          recipientName: cell(row.values, detected.mapping.recipientName),
          sourceFileName: filename,
          sourceRowData,
        });

        return queue;
      }, []);

    if (queueRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No non-empty addresses were found in the detected address column.",
          detectedHeaders: detected.headers,
        },
        { status: 400 },
      );
    }

    // Create the job and persist its queue rows in PostgreSQL.
    const job = await createUploadJob({
      fileName: filename,
      rows: queueRows,
    });

    return NextResponse.json(
      {
        success: true,
        message:
          "File uploaded successfully. Rows have been queued for processing.",
        job: {
          id: job.id,
          fileName: job.fileName,
          status: job.status,
          totalRows: job.totalRows,
        },
        rowsRead: dataRows.length,
        addressesQueued: queueRows.length,
        rowsWithoutAddress: dataRows.length - queueRows.length,
        detectedColumns: {
          address: detected.headers[detected.mapping.address] ?? null,
          phone:
            detected.mapping.phone === undefined
              ? null
              : detected.headers[detected.mapping.phone],
          recipientName:
            detected.mapping.recipientName === undefined
              ? null
              : detected.headers[detected.mapping.recipientName],
          roSro:
            detected.mapping.roSro === undefined
              ? null
              : detected.headers[detected.mapping.roSro],
          branchOffice:
            detected.mapping.branchOffice === undefined
              ? null
              : detected.headers[detected.mapping.branchOffice],
        },
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Upload staging failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload and queue the file.",
      },
      { status: 500 },
    );
  }
}
