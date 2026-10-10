import { NextRequest, NextResponse } from "next/server";
import { readFile, detectMapping } from "@/lib/excel";
import { insertProcessed, processRecord } from "@/lib/process";
import { db } from "@/lib/db";
import { addLocalRecord } from "@/lib/local-store";
import type { LocationRecord } from "@/types";
import { checkMapplsAccess } from "@/lib/mappls";

export const runtime = "nodejs";
export const maxDuration = 300;

function cell(values: string[], index: number | undefined) {
  if (index === undefined) return null;
  return values[index]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.MAPPLS_ACCESS_TOKEN) {
      return NextResponse.json({
        error: "MAPPLS_ACCESS_TOKEN is not configured. The demo intentionally does not use mock geocoding."
      }, { status: 500 });
    }

    const mapplsAccess = await checkMapplsAccess();
    if (!mapplsAccess.ok) {
      return NextResponse.json({
        error: `${mapplsAccess.error} Update MAPPLS_ACCESS_TOKEN with the static key from the Mappls Console credentials for this Web app, then restart the server.`
      }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an .xlsx or .csv file." }, { status: 400 });
    }

    const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
    if (file.size > maxMb * 1024 * 1024) {
      return NextResponse.json({ error: `Maximum upload size is ${maxMb} MB.` }, { status: 400 });
    }

    const isExcel = file.name.toLowerCase().endsWith(".xlsx");
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    if (!isExcel && !isCsv) {
      return NextResponse.json({ error: "Only .xlsx and .csv files are supported." }, { status: 400 });
    }

    const rows = await readFile(await file.arrayBuffer(), file.name);
    const detected = detectMapping(rows);
    const dataRows = detected.hasHeader ? rows.slice(1) : rows;

    let inserted = 0;
    let review = 0;
    let unresolved = 0;
    let errors = 0;

    for (const row of dataRows) {
      const address = cell(row.values, detected.mapping.address);
      if (!address) continue;

      try {
        const processed = await processRecord({
          originalAddress: address,
          phoneNumber: cell(row.values, detected.mapping.phone),
          recipientName: cell(row.values, detected.mapping.recipientName),
          sourceRowNumber: row.rowNumber,
          sourceFileName: file.name
        });

        if (db) {
          await insertProcessed(processed);
        } else {
          addLocalRecord(processed);
        }

        inserted++;
        if (processed.status === "review") review++;
        if (processed.status === "unresolved") unresolved++;
      } catch (error) {
        errors++;
        const failedRecord: Omit<LocationRecord, "id" | "created_at" | "updated_at"> = {
          original_address: address,
          full_address: null,
          recipient_name: cell(row.values, detected.mapping.recipientName),
          village_name: null,
          landmark: null,
          tehsil_taluka: null,
          block_name: null,
          district: null,
          state: null,
          post_office_name: null,
          pin_code: null,
          phone_number: cell(row.values, detected.mapping.phone),
          latitude: null,
          longitude: null,
          normalization_provider: null,
          geocode_provider: null,
          confidence_score: 0,
          status: "error",
          error_message: error instanceof Error ? error.message : "Processing failed.",
          source_row_number: row.rowNumber,
          source_file_name: file.name
        };
        if (db) {
          await insertProcessed(failedRecord);
        } else {
          addLocalRecord(failedRecord);
        }
        inserted++;
      }
    }

    return NextResponse.json({
      success: true,
      file: file.name,
      rowsRead: dataRows.length,
      inserted,
      review,
      unresolved,
      errors
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Upload failed."
    }, { status: 500 });
  }
}
