import type { NormalizedAddress } from "@/types";

const ENDPOINT = "https://search.mappls.com/search/address";
const PLACE_ENDPOINT = "https://place.mappls.com/O2O/entity/place-details";

export async function checkMapplsAccess() {
  const token = process.env.MAPPLS_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "MAPPLS_ACCESS_TOKEN is missing." };

  const url = new URL(`${ENDPOINT}/geocode`);
  url.searchParams.set("address", "BARHRA");
  url.searchParams.set("access_token", token);
  url.searchParams.set("itemCount", "1");
  url.searchParams.set("region", "IND");

  const response = await fetch(url, { cache: "no-store" });
  if (response.ok || response.status === 204) return { ok: true as const };

  const body = await response.text();
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error_description ?? parsed.error ?? detail;
  } catch {
    // Keep the bounded response text when Mappls does not return JSON.
  }

  return {
    ok: false as const,
    error: `Mappls authorization failed (${response.status}): ${detail}`
  };
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function tokenMap(tokens: any[]) {
  const map: Record<string, string[]> = {};

  for (const item of Array.isArray(tokens) ? tokens : []) {
    const type = String(item?.tokenType ?? "").toLowerCase();
    const token = clean(item?.token);
    if (!token) continue;
    if (!map[type]) map[type] = [];
    map[type].push(token);
  }

  return map;
}

function first(map: Record<string, string[]>, ...keys: string[]) {
  for (const key of keys) {
    if (map[key]?.length) return map[key][0];
  }
  return null;
}

function extractConfidence(data: any) {
  const candidates = [
    data?.confidence,
    data?.score,
    data?.results?.[0]?.confidence,
    data?.copResults?.[0]?.confidence
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }

  return 80;
}

function geocodeResult(data: any) {
  const results = data?.copResults ?? data?.results ?? data?.data ?? data?.response?.results;
  return Array.isArray(results) ? results[0] : results;
}

function normalizedFromGeocode(result: any, address: string): NormalizedAddress {
  const confidence = Number(result?.confidenceScore);
  const score = Number.isFinite(confidence)
    ? Math.round(Math.max(0, Math.min(1, confidence)) * 100)
    : 50;

  return {
    full_address: clean(result?.formattedAddress) ?? address,
    recipient_name: null,
    village_name: clean(result?.village) ?? clean(result?.locality),
    landmark: clean(result?.poi) ?? clean(result?.street),
    tehsil_taluka: clean(result?.subDistrict),
    block_name: null,
    district: clean(result?.district),
    police_station_name: null,
    state: clean(result?.state),
    post_office_name: null,
    pin_code: clean(result?.pincode)?.match(/\b\d{6}\b/)?.[0] ?? null,
    confidence_score: score,
    provider: "mappls-geocode"
  };
}

export async function mapplsNormalize(address: string): Promise<NormalizedAddress> {
  const token = process.env.MAPPLS_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MAPPLS_ACCESS_TOKEN is missing.");
  }

  const url = new URL(`${ENDPOINT}/addressAnalytics`);
  url.searchParams.set("address", address);
  url.searchParams.set("access_token", token);

  const response = await fetch(url, { cache: "no-store" });

  if (response.status === 204) {
    throw new Error("Mappls did not find address components.");
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) {
      const fallback = await mapplsGeocode(address);
      if (fallback.match) return normalizedFromGeocode(fallback.match, address);
    }
    throw new Error(`Mappls Address Analytics failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const input = data?.inputAddress ?? {};
  const standard = data?.standardizedData ?? {};
  const parsed = data?.parsedData ?? {};

  const tokens = tokenMap(standard.standardizedTokens ?? []);
  const parsedTokens = tokenMap(parsed.parsedTokens ?? []);

  const pick = (...keys: string[]) => first(tokens, ...keys) ?? first(parsedTokens, ...keys);

  const village = pick("village");
  const postOffice = pick("postoffice", "post office");
  const subDistrict = pick("subdistrict", "sub district");
  const district = pick("district");
  const state = pick("state");
  const pincode = pick("pincode", "pin code");

  const formatted =
    clean(standard.formattedAddress) ??
    clean(data?.formattedAddress) ??
    clean(input?.formattedAddress) ??
    address;

  const remaining = clean(standard.remainingAddress);
  const landmark = pick("landmark");
  const locality = pick("locality", "sublocality", "sub locality", "subsub locality");

  // Mappls uses administrative terminology such as subDistrict.
  // We keep the product's separate Block field. Block is only populated
  // when the source/normalization service explicitly supplies it.
  const block = pick("block");

  const knownFields = [village, landmark, subDistrict, block, district, state, postOffice, pincode]
    .filter(Boolean).length;

  return {
    full_address: formatted,
    recipient_name: null,
    village_name: village ?? locality,
    landmark: landmark ?? remaining,
    tehsil_taluka: subDistrict,
    block_name: block,
    police_station_name: null,
    district,
    state,
    post_office_name: postOffice,
    pin_code: pincode?.match(/\b\d{6}\b/)?.[0] ?? null,
    confidence_score: Math.max(50, Math.min(100, 50 + knownFields * 6)),
    provider: "mappls-address-analytics"
  };
}

export async function mapplsGeocode(address: string, pinCode?: string | null) {
  const token = process.env.MAPPLS_ACCESS_TOKEN;
  if (!token) throw new Error("MAPPLS_ACCESS_TOKEN is missing.");

  const url = new URL(`${ENDPOINT}/geocode`);
  url.searchParams.set("address", address);
  url.searchParams.set("access_token", token);
  url.searchParams.set("itemCount", "3");
  url.searchParams.set("region", "IND");
  url.searchParams.set("actualGeoLevel", "");

  if (pinCode) url.searchParams.set("podFilter", "pincode");

  const response = await fetch(url, { cache: "no-store" });

  if (response.status === 204) {
    return {
      latitude: null,
      longitude: null,
      confidence: 0,
      provider: "mappls-geocode",
      status: "unresolved" as const
    };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mappls Geocode failed (${response.status}): ${body.slice(0, 300)}`);
  }

const data = await response.json();

console.log(
  "[Mappls Geocode] Raw API response:",
  JSON.stringify(data, null, 2),
);

const result = geocodeResult(data);

console.log(
  "[Mappls Geocode] Selected result:",
  JSON.stringify(result, null, 2),
);

  const latitude = Number(result?.latitude ?? result?.lat ?? result?.location?.lat);
  const longitude = Number(result?.longitude ?? result?.lng ?? result?.lon ?? result?.location?.lng);

  if (!result) {
    return {
      latitude: null,
      longitude: null,
      confidence: 0,
      provider: "mappls-geocode",
      status: "unresolved" as const,
      match: null
    };
  }

  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  return {
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    confidence: extractConfidence(result ?? data),
    provider: "mappls-geocode",
    status: hasCoordinates ? "processed" as const : "review" as const,
    match: result
  };
}
