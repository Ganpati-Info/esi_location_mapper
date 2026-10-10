import { db } from "./db";
import { mapplsGeocode, mapplsNormalize } from "./mappls";
import { enrichWithGemini } from "./gemini";
import type { LocationRecord } from "@/types";

function delay(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function processRecord(input: {
  originalAddress: string;
  phoneNumber?: string | null;
  recipientName?: string | null;
  sourceRowNumber?: number;
  sourceFileName?: string;
}): Promise<Omit<LocationRecord, "id" | "created_at" | "updated_at">> {
  const normalized = await mapplsNormalize(input.originalAddress);
  const enriched = await enrichWithGemini(input.originalAddress, {
    ...normalized,
    recipient_name: input.recipientName ?? normalized.recipient_name
  });

  await delay(Number(process.env.MAPPLS_DELAY_MS ?? 150));

  const geocode = await mapplsGeocode(enriched.full_address ?? input.originalAddress, enriched.pin_code);

  const confidence = geocode.latitude === null
    ? enriched.confidence_score
    : Math.round((enriched.confidence_score * 0.4) + (geocode.confidence * 0.6));

  const status = geocode.status === "unresolved"
    ? "unresolved"
    : confidence < 70
      ? "review"
      : "processed";

  return {
    original_address: input.originalAddress,
    full_address: enriched.full_address,
    recipient_name: input.recipientName ?? enriched.recipient_name,
    village_name: enriched.village_name,
    landmark: enriched.landmark,
    tehsil_taluka: enriched.tehsil_taluka,
    block_name: enriched.block_name,
    district: enriched.district,
    state: enriched.state,
    post_office_name: enriched.post_office_name,
    pin_code: enriched.pin_code,
    phone_number: input.phoneNumber ?? null,
    latitude: geocode.latitude,
    longitude: geocode.longitude,
    normalization_provider: enriched.provider,
    geocode_provider: geocode.provider,
    confidence_score: confidence,
    status,
    error_message: null,
    source_row_number: input.sourceRowNumber ?? null,
    source_file_name: input.sourceFileName ?? null
  };
}

export async function insertProcessed(record: Omit<LocationRecord, "id" | "created_at" | "updated_at">) {
  if (!db) {
    throw new Error("DATABASE_URL is missing. Upload processing requires a configured database.");
  }

  await db.query(
    `INSERT INTO location_records
    (
      original_address, full_address, recipient_name, village_name, landmark,
      tehsil_taluka, block_name, district, state, post_office_name, pin_code,
      phone_number, latitude, longitude, normalization_provider,
      geocode_provider, confidence_score, status, error_message,
      source_row_number, source_file_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      record.original_address, record.full_address, record.recipient_name,
      record.village_name, record.landmark, record.tehsil_taluka,
      record.block_name, record.district, record.state, record.post_office_name,
      record.pin_code, record.phone_number, record.latitude, record.longitude,
      record.normalization_provider, record.geocode_provider,
      record.confidence_score, record.status, record.error_message,
      record.source_row_number, record.source_file_name
    ]
  );
}
