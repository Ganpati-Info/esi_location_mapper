import { db } from "./db";
import { enrichWithGemini } from "./gemini";

import type { LocationRecord, NormalizedAddress } from "@/types";

type ProcessedRecord = Omit<LocationRecord, "id" | "created_at" | "updated_at">;

function normalizeState(state: string | null | undefined): string {
  return (state ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ");
}

function isWestBengal(state: string | null | undefined): boolean {
  const normalized = normalizeState(state);

  return (
    normalized === "west bengal" ||
    normalized === "westbengal" ||
    normalized === "wb"
  );
}

function hasValidCoordinates(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 21.4 &&
    latitude <= 27.5 &&
    longitude >= 85.5 &&
    longitude <= 89.9
  );
}

function createEmptyNormalization(
  address: string,
  recipientName?: string | null,
): NormalizedAddress {
  return {
    full_address: address,
    recipient_name: recipientName ?? null,
    village_name: null,
    police_station_name: null,
    landmark: null,
    tehsil_taluka: null,
    block_name: null,
    district: null,
    state: null,
    post_office_name: null,
    pin_code: null,
    confidence_score: 0,
    provider: "original-address",
  };
}

function filteredRecord(
  input: {
    originalAddress: string;
    phoneNumber?: string | null;
    recipientName?: string | null;
    roSro?: string | null;
    branchOffice?: string | null;
    sourceRowNumber?: number;
    sourceFileName?: string;
  },
  fields: NormalizedAddress,
  reason: string,
  provider: string,
): ProcessedRecord {
  return {
    original_address: input.originalAddress,

    full_address: fields.full_address ?? input.originalAddress,

    recipient_name: input.recipientName ?? fields.recipient_name,

    village_name: fields.village_name,
    landmark: fields.landmark,
    tehsil_taluka: fields.tehsil_taluka,
    block_name: fields.block_name,
    police_station_name: null,

    district: fields.district,
    state: fields.state,
    post_office_name: fields.post_office_name,
    pin_code: fields.pin_code,

    phone_number: input.phoneNumber ?? null,

    ro_sro: input.roSro ?? null,
    branch_office: input.branchOffice ?? null,

    latitude: null,
    longitude: null,

    normalization_provider: fields.provider,
    geocode_provider: provider,

    confidence_score: 0,
    status: "unresolved",
    error_message: reason,

    source_row_number: input.sourceRowNumber ?? null,
    source_file_name: input.sourceFileName ?? null,
  };
}

export async function processRecord(input: {
  originalAddress: string;
  phoneNumber?: string | null;
  recipientName?: string | null;
  roSro?: string | null;
  branchOffice?: string | null;
  sourceRowNumber?: number;
  sourceFileName?: string;
}): Promise<ProcessedRecord> {
  const originalAddress = input.originalAddress.trim();

  /*
   * Do not maintain a fixed list of invalid strings.
   * Gemini must evaluate the original address itself.
   */
  const baseline = createEmptyNormalization(
    originalAddress,
    input.recipientName,
  );

  const enriched = await enrichWithGemini(originalAddress, baseline, {
    roSro: input.roSro,
    branchOffice: input.branchOffice,
  });

  /*
   * Gemini classified the input as unreadable, outside the
   * allowed state, or too ambiguous to identify.
   */
  if (enriched.address_decision !== "valid_west_bengal") {
    const reason =
      enriched.address_reason ||
      "Gemini could not identify a valid West Bengal location.";

    const provider =
      enriched.address_decision === "unreadable"
        ? "filtered-gemini-unreadable"
        : enriched.address_decision === "outside_west_bengal"
          ? "filtered-outside-west-bengal"
          : "filtered-gemini-uncertain";

    console.log(
      `[Address Filter] Row ${
        input.sourceRowNumber ?? "unknown"
      }: ${provider}; ${reason}`,
    );

    return filteredRecord(
      { ...input, originalAddress },
      enriched,
      reason,
      provider,
    );
  }

  /*
   * Independently check the state returned by Gemini.
   */
  if (!isWestBengal(enriched.state)) {
    return filteredRecord(
      { ...input, originalAddress },
      enriched,
      "Gemini did not establish West Bengal as the resolved state.",
      "filtered-state-validation",
    );
  }

  /*
   * Require coordinates. An address may be readable but still
   * lack a sufficiently reliable location estimate.
   */
  if (!hasValidCoordinates(enriched.latitude, enriched.longitude)) {
    return filteredRecord(
      { ...input, originalAddress },
      enriched,
      enriched.coordinate_reason ||
        "Gemini could not return valid West Bengal coordinates.",
      "filtered-gemini-no-coordinates",
    );
  }

  /*
   * Accept estimates for mapping only as review candidates.
   * They are not verified geocoding results.
   */
  return {
    original_address: originalAddress,

    full_address: enriched.full_address ?? originalAddress,

    recipient_name: input.recipientName ?? enriched.recipient_name,

    village_name: enriched.village_name,
    landmark: enriched.landmark,
    tehsil_taluka: enriched.tehsil_taluka,
    block_name: enriched.block_name,
    police_station_name: null,

    district: enriched.district,
    state: enriched.state,
    post_office_name: enriched.post_office_name,
    pin_code: enriched.pin_code,

    phone_number: input.phoneNumber ?? null,

    ro_sro: input.roSro ?? null,
    branch_office: input.branchOffice ?? null,

    latitude: enriched.latitude,
    longitude: enriched.longitude,

    normalization_provider: enriched.provider,

    geocode_provider: `gemini-estimate-unverified:${enriched.coordinate_precision}`,

    confidence_score: Math.min(55, enriched.coordinate_confidence),

    status: "review",

    error_message:
      "Gemini-generated coordinates are unverified estimates. " +
      enriched.coordinate_reason,

    source_row_number: input.sourceRowNumber ?? null,
    source_file_name: input.sourceFileName ?? null,
  };
}

/**
 * Existing database insertion helper.
 * The queue worker already handles its own transactional inserts.
 */
export async function insertProcessed(record: ProcessedRecord) {
  if (!db) {
    throw new Error(
      "DATABASE_URL is missing. Upload processing requires a configured database.",
    );
  }

  await db.query(
    `INSERT INTO location_records (
      original_address,
      full_address,
      recipient_name,
      village_name,
      landmark,
      tehsil_taluka,
      block_name,
      police_station_name,
      district,
      state,
      post_office_name,
      pin_code,
      phone_number,
      ro_sro,
      branch_office,
      latitude,
      longitude,
      normalization_provider,
      geocode_provider,
      confidence_score,
      status,
      error_message,
      source_row_number,
      source_file_name
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24
    )`,
    [
      record.original_address,
      record.full_address,
      record.recipient_name,
      record.village_name,
      record.landmark,
      record.tehsil_taluka,
      record.block_name,
      record.police_station_name,
      record.district,
      record.state,
      record.post_office_name,
      record.pin_code,
      record.phone_number,
      record.ro_sro,
      record.branch_office,
      record.latitude,
      record.longitude,
      record.normalization_provider,
      record.geocode_provider,
      record.confidence_score,
      record.status,
      record.error_message,
      record.source_row_number,
      record.source_file_name,
    ],
  );
}
