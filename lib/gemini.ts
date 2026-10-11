import { GoogleGenAI } from "@google/genai";
import type { NormalizedAddress } from "@/types";

export type AddressDecision =
  | "valid_west_bengal"
  | "unreadable"
  | "outside_west_bengal"
  | "uncertain";

export type CoordinatePrecision =
  | "village"
  | "locality"
  | "town"
  | "postcode"
  | "district"
  | "unknown";

export interface GeminiEnrichedAddress extends NormalizedAddress {
  latitude: number | null;
  longitude: number | null;

  address_decision: AddressDecision;
  address_reason: string;

  coordinate_confidence: number;
  coordinate_precision: CoordinatePrecision;
  coordinate_reason: string;
}

interface GeminiAddressResponse {
  recipient_name: string | null;
  village_name: string | null;
  landmark: string | null;
  tehsil_taluka: string | null;
  block_name: string | null;
  district: string | null;
  state: string | null;
  post_office_name: string | null;
  pin_code: string | null;

  address_decision: AddressDecision;
  address_reason: string;

  latitude: number | null;
  longitude: number | null;

  coordinate_confidence: number;
  coordinate_precision: CoordinatePrecision;
  coordinate_reason: string;
}

const schema = {
  type: "object",
  properties: {
    recipient_name: { type: ["string", "null"] },
    village_name: { type: ["string", "null"] },
    landmark: { type: ["string", "null"] },
    tehsil_taluka: { type: ["string", "null"] },
    block_name: { type: ["string", "null"] },
    district: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    post_office_name: { type: ["string", "null"] },
    pin_code: { type: ["string", "null"] },

    address_decision: {
      type: "string",
      enum: [
        "valid_west_bengal",
        "unreadable",
        "outside_west_bengal",
        "uncertain",
      ],
    },

    address_reason: {
      type: "string",
      description:
        "Explain why the original address is identifiable, unreadable, outside West Bengal, or uncertain.",
    },

    latitude: { type: ["number", "null"] },
    longitude: { type: ["number", "null"] },

    coordinate_confidence: {
      type: "number",
      description:
        "A rough confidence estimate from 0 to 100, not a verified probability.",
    },

    coordinate_precision: {
      type: "string",
      enum: ["village", "locality", "town", "postcode", "district", "unknown"],
    },

    coordinate_reason: {
      type: "string",
      description:
        "Explain what geographic area the estimated coordinates represent and their uncertainty.",
    },
  },

  required: [
    "recipient_name",
    "village_name",
    "landmark",
    "tehsil_taluka",
    "block_name",
    "district",
    "state",
    "post_office_name",
    "pin_code",
    "address_decision",
    "address_reason",
    "latitude",
    "longitude",
    "coordinate_confidence",
    "coordinate_precision",
    "coordinate_reason",
  ],
};

const PRECISIONS: CoordinatePrecision[] = [
  "village",
  "locality",
  "town",
  "postcode",
  "district",
  "unknown",
];

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function validPinCode(value: unknown): string | null {
  const pinCode = String(value ?? "").trim();

  return /^[0-9]{6}$/.test(pinCode) ? pinCode : null;
}

function normalizeState(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ");
}

function isWestBengal(value: string | null): boolean {
  const state = normalizeState(value);

  return state === "west bengal" || state === "westbengal" || state === "wb";
}

function clampConfidence(value: unknown): number {
  const score = Number(value);

  if (!Number.isFinite(score)) return 0;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function validCoordinatePair(latitude: unknown, longitude: unknown): boolean {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }

  // Broad sanity bounds for West Bengal.
  // These are not an official administrative-boundary polygon.
  return (
    latitude >= 21.4 &&
    latitude <= 27.5 &&
    longitude >= 85.5 &&
    longitude <= 89.9
  );
}

function safeFallback(
  originalAddress: string,
  current: NormalizedAddress,
  reason: string,
): GeminiEnrichedAddress {
  return {
    ...current,

    full_address: current.full_address ?? originalAddress,

    latitude: null,
    longitude: null,

    address_decision: "uncertain",
    address_reason: reason,

    coordinate_confidence: 0,
    coordinate_precision: "unknown",
    coordinate_reason: reason,
  };
}

export async function enrichWithGemini(
  originalAddress: string,
  current: NormalizedAddress,
  context?: {
    roSro?: string | null;
    branchOffice?: string | null;
  },
): Promise<GeminiEnrichedAddress> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return safeFallback(
      originalAddress,
      current,
      "Gemini API key is unavailable.",
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      "You are an Indian address classification and approximate coordinate estimation assistant.",
      "",
      "Your task is to decide whether the ORIGINAL ADDRESS identifies a plausible location in West Bengal, India.",
      "",
      "IMPORTANT: Do not use a fixed list of known invalid strings. Evaluate the meaning and geographic information in each original address.",
      "",
      "ADDRESS CLASSIFICATION:",
      "1. valid_west_bengal: The original address contains enough meaningful information to identify a plausible location in West Bengal.",
      "2. unreadable: The original address is empty, nonsensical, corrupted, or does not contain enough meaningful location information to identify a place.",
      "3. outside_west_bengal: The original address identifies a location outside West Bengal.",
      "4. uncertain: The address may represent a real place, but you cannot confidently determine the location or whether it belongs to West Bengal.",
      "",
      "EVIDENCE RULES:",
      "1. The ORIGINAL ADDRESS is the primary evidence.",
      "2. Do not assume that a location exists merely because a map service or previous model returned a candidate.",
      "3. RO_SRO and Branch_office are supplementary context only. They are NOT proof of a village, district, state, or PIN code.",
      "4. Never force an address into West Bengal simply because its RO/SRO or branch office is associated with West Bengal.",
      "5. Do not turn meaningless input into a real place by guessing a similarly spelled place elsewhere in India.",
      "6. A short or misspelled address can still be valid if its geographic meaning is identifiable. Judge meaning, not string length alone.",
      "7. If a valid address belongs to Bankura, Birbhum, Murshidabad, Paschim Bardhaman, Purulia, or another district in West Bengal, do not reject it merely because it is outside Durgapur.",
      "8. If you cannot establish that the original address identifies a location in West Bengal, choose uncertain or unreadable rather than guessing.",
      "",
      "COORDINATE RULES:",
      "1. Only return coordinates when address_decision is valid_west_bengal.",
      "2. Estimate the most specific geographic location you can reasonably identify.",
      "3. Prefer a village or locality location over a town, postcode, or district centre.",
      "4. Do not describe town-centre or postcode-level coordinates as exact village coordinates.",
      "5. Never generate random coordinates to fill the fields.",
      "6. If the location cannot be reasonably estimated, return null for BOTH latitude and longitude.",
      "7. Coordinates must be numeric latitude and longitude in decimal degrees.",
      "8. Do not claim that estimated coordinates have been verified against a live map or GPS database.",
      "9. coordinate_confidence is only your rough assessment, not a verified probability.",
      "10. If address_decision is unreadable, outside_west_bengal, or uncertain, latitude and longitude MUST both be null.",
      "11. If the state is not demonstrably West Bengal, do not classify the address as valid_west_bengal.",
      "",
      "ADDRESS FIELD RULES:",
      "1. Extract village, post office, subdistrict, block, district, state, and PIN code only when supported.",
      "2. Never invent missing administrative fields.",
      "3. Do not treat a subdistrict as a development block unless evidence supports that equivalence.",
      "4. Return a six-digit PIN code only when identifiable.",
      "",
      "Return only JSON matching the provided schema.",
      "",
      `ORIGINAL ADDRESS: ${originalAddress}`,
      "",
      `Existing fields, which may be incomplete or incorrect: ${JSON.stringify(current)}`,
      "",
      `RO/SRO (supplementary context only): ${context?.roSro ?? "Not provided"}`,
      `Branch office (supplementary context only): ${context?.branchOffice ?? "Not provided"}`,
    ].join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    if (!response.text) {
      return safeFallback(
        originalAddress,
        current,
        "Gemini returned an empty response.",
      );
    }

    const parsed = JSON.parse(response.text) as GeminiAddressResponse;

    const decisions: AddressDecision[] = [
      "valid_west_bengal",
      "unreadable",
      "outside_west_bengal",
      "uncertain",
    ];

    const decision = decisions.includes(parsed.address_decision)
      ? parsed.address_decision
      : "uncertain";

    const latitude =
      typeof parsed.latitude === "number" ? parsed.latitude : null;

    const longitude =
      typeof parsed.longitude === "number" ? parsed.longitude : null;

    /*
     * The model's classification alone is not enough.
     * Require state=West Bengal and a numerically plausible pair.
     */
    const accepted =
      decision === "valid_west_bengal" &&
      isWestBengal(cleanText(parsed.state)) &&
      validCoordinatePair(latitude, longitude);

    const precision = PRECISIONS.includes(parsed.coordinate_precision)
      ? parsed.coordinate_precision
      : "unknown";

    const pinCode = validPinCode(parsed.pin_code) ?? current.pin_code;

    const fullAddress = [
      cleanText(parsed.village_name),
      cleanText(parsed.tehsil_taluka),
      cleanText(parsed.district),
      isWestBengal(cleanText(parsed.state))
        ? "West Bengal"
        : cleanText(parsed.state),
      validPinCode(parsed.pin_code),
    ]
      .filter(Boolean)
      .join(", ");

    return {
      ...current,

      full_address: fullAddress || current.full_address || originalAddress,

      recipient_name:
        cleanText(parsed.recipient_name) ?? current.recipient_name,

      village_name: cleanText(parsed.village_name) ?? current.village_name,

      landmark: cleanText(parsed.landmark) ?? current.landmark,

      tehsil_taluka: cleanText(parsed.tehsil_taluka) ?? current.tehsil_taluka,

      block_name: cleanText(parsed.block_name) ?? current.block_name,

      district: cleanText(parsed.district) ?? current.district,

      state: cleanText(parsed.state) ?? current.state,

      post_office_name:
        cleanText(parsed.post_office_name) ?? current.post_office_name,

      pin_code: pinCode,

      address_decision: accepted
        ? "valid_west_bengal"
        : decision === "valid_west_bengal"
          ? "uncertain"
          : decision,

      address_reason:
        cleanText(parsed.address_reason) ??
        "No classification explanation was returned.",

      latitude: accepted ? latitude : null,

      longitude: accepted ? longitude : null,

      coordinate_confidence: accepted
        ? clampConfidence(parsed.coordinate_confidence)
        : 0,

      coordinate_precision: accepted ? precision : "unknown",

      coordinate_reason:
        cleanText(parsed.coordinate_reason) ??
        "Coordinates could not be established.",

      confidence_score: current.confidence_score,

      provider: "gemini-address-classification",
    };
  } catch (error) {
    console.error(
      "[Gemini] Address classification failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return safeFallback(
      originalAddress,
      current,
      "Gemini failed to classify this address. Filtered for review.",
    );
  }
}
