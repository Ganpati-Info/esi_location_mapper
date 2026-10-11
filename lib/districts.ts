/**
 * Location Connect
 * West Bengal district utilities.
 *
 * This module provides a canonical district list for:
 * - District Explorer
 * - District-scoped dashboard
 * - Map explorer
 * - Location records
 * - Review and rejected entries
 *
 * District selection is a filter, not permission to relabel records.
 */

export const WEST_BENGAL_DISTRICTS = [
  "Alipurduar",
  "Bankura",
  "Birbhum",
  "Cooch Behar",
  "Dakshin Dinajpur",
  "Darjeeling",
  "Hooghly",
  "Howrah",
  "Jalpaiguri",
  "Jhargram",
  "Kalimpong",
  "Kolkata",
  "Malda",
  "Murshidabad",
  "Nadia",
  "North 24 Parganas",
  "Paschim Bardhaman",
  "Paschim Medinipur",
  "Purba Bardhaman",
  "Purba Medinipur",
  "Purulia",
  "South 24 Parganas",
  "Uttar Dinajpur",
] as const;

export type WestBengalDistrict = (typeof WEST_BENGAL_DISTRICTS)[number];

/**
 * Normalize district names for matching.
 *
 * Examples:
 * "North 24 Parganas" -> "north24parganas"
 * "North 24 Paraganas" -> "north24paraganas"
 */
function normalizeDistrictName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Known alternate spellings and historical/common names.
 *
 * These aliases are for matching names only.
 * They must never be used to infer the district of an
 * unrelated or unverified address.
 */
const DISTRICT_ALIASES: Partial<Record<WestBengalDistrict, readonly string[]>> =
  {
    "Cooch Behar": ["Coochbehar", "Koch Behar", "Koch Bihar"],

    "Dakshin Dinajpur": ["South Dinajpur"],

    "Uttar Dinajpur": ["North Dinajpur"],

    "Paschim Medinipur": ["West Medinipur", "West Midnapore"],

    "Purba Medinipur": ["East Medinipur", "East Midnapore"],

    "Paschim Bardhaman": ["West Bardhaman", "Paschim Burdwan", "West Burdwan"],

    "Purba Bardhaman": ["East Bardhaman", "Purba Burdwan", "East Burdwan"],

    "North 24 Parganas": [
      "North 24 Paraganas",
      "North Twenty Four Parganas",
      "North 24 Pargana",
    ],

    "South 24 Parganas": [
      "South 24 Paraganas",
      "South Twenty Four Parganas",
      "South 24 Pargana",
    ],
  };

/**
 * Resolve user input to a canonical West Bengal district.
 *
 * Returns null when the supplied name is not recognized.
 * Never silently assigns an unknown district.
 */
export function resolveDistrict(
  value: string | null | undefined,
): WestBengalDistrict | null {
  if (!value?.trim()) {
    return null;
  }

  const normalizedInput = normalizeDistrictName(value);

  for (const district of WEST_BENGAL_DISTRICTS) {
    if (normalizeDistrictName(district) === normalizedInput) {
      return district;
    }

    const aliases = DISTRICT_ALIASES[district] ?? [];

    const aliasMatch = aliases.some(
      (alias) => normalizeDistrictName(alias) === normalizedInput,
    );

    if (aliasMatch) {
      return district;
    }
  }

  return null;
}

/**
 * Check whether a value resolves to a supported district.
 */
export function isWestBengalDistrict(
  value: string | null | undefined,
): value is WestBengalDistrict {
  return resolveDistrict(value) !== null;
}

/**
 * Build a district-scoped URL.
 *
 * Example:
 * districtHref("/dashboard", "Bankura")
 * -> "/dashboard?district=Bankura"
 *
 * If additional query parameters already exist, they are preserved.
 */
export function districtHref(
  path: string,
  district: string,
  extraParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  const canonicalDistrict = resolveDistrict(district);

  if (!canonicalDistrict) {
    return "/";
  }

  const [pathname, existingQuery = ""] = path.split("?");

  const params = new URLSearchParams(existingQuery);

  params.set("district", canonicalDistrict);

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
  }

  return `${pathname}?${params.toString()}`;
}

/**
 * Read and validate a district from a URLSearchParams object.
 *
 * Useful in client-side components.
 */
export function getDistrictFromParams(
  params: URLSearchParams,
): WestBengalDistrict | null {
  return resolveDistrict(params.get("district"));
}

/**
 * Normalize a district for comparisons and grouping.
 *
 * Use this only for matching district names.
 * Database filtering should use the canonical district returned
 * by resolveDistrict().
 */
export function districtsMatch(
  first: string | null | undefined,
  second: string | null | undefined,
): boolean {
  const resolvedFirst = resolveDistrict(first);
  const resolvedSecond = resolveDistrict(second);

  if (!resolvedFirst || !resolvedSecond) {
    return false;
  }

  return resolvedFirst === resolvedSecond;
}
