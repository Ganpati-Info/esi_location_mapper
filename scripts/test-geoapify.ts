import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const ENDPOINT = "https://api.geoapify.com/v1/geocode/search";

interface GeoapifyResult {
  lat?: number;
  lon?: number;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  result_type?: string;
  name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  state_code?: string;
  county?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  postcode?: string;
  street?: string;
  datasource?: {
    sourcename?: string;
    attribution?: string;
  };
  rank?: {
    confidence?: number;
    confidence_city_level?: number;
    confidence_street_level?: number;
    confidence_building_level?: number;
    match_type?: string;
  };
}

interface GeoapifyResponse {
  results?: GeoapifyResult[];
  statusCode?: number;
  error?: string;
  message?: string;
}

const searches = [
  {
    label: "Exact address with postcode",
    text: "Arjunpur Angadpur, Durgapur, Paschim Bardhaman, West Bengal 713215, India",
  },
  {
    label: "Locality without postcode",
    text: "Arjunpur Angadpur, Durgapur, Paschim Bardhaman, West Bengal, India",
  },
  {
    label: "Angadpur locality",
    text: "Angadpur, Durgapur, West Bengal, India",
  },
  {
    label: "Arjun Pur spelling variant",
    text: "Arjun Pur, Faridpur Durgapur, Paschim Bardhaman, West Bengal, India",
  },
  {
    label: "Durgapur reference only",
    text: "Durgapur, Paschim Bardhaman, West Bengal, India",
  },
];

function validCoordinates(result: GeoapifyResult) {
  const lat = Number(result.lat);
  const lon = Number(result.lon);

  if (
    result.lat === undefined ||
    result.lon === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lon,
  };
}

function summarize(result: GeoapifyResult, index: number) {
  const coords = validCoordinates(result);

  return {
    candidate: index + 1,
    name: result.name ?? null,
    formattedAddress: result.formatted ?? null,

    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,

    village: result.village ?? null,
    suburb: result.suburb ?? null,
    town: result.town ?? null,
    city: result.city ?? null,
    district: result.district ?? null,
    county: result.county ?? null,
    state: result.state ?? null,
    postcode: result.postcode ?? null,
    country: result.country ?? null,

    resultType: result.result_type ?? null,
    source: result.datasource?.sourcename ?? null,
    confidence: result.rank?.confidence ?? null,
    cityConfidence: result.rank?.confidence_city_level ?? null,
    matchType: result.rank?.match_type ?? null,
  };
}

async function main() {
  console.log("========================================");
  console.log("          GEOAPIFY GEOCODING TEST");
  console.log("========================================\n");

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  if (!apiKey) {
    console.error("GEOAPIFY_API_KEY was not found.");
    console.error("Add it to the .env file in your project root.");
    process.exitCode = 1;
    return;
  }

  console.log("API key found: true (value hidden)");
  console.log(`Queries to test: ${searches.length}`);
  console.log("Country filter: India");

  const summary: Array<{
    query: string;
    status: number | string;
    count: number;
  }> = [];

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];

    console.log(`\n${i + 1}. ${search.label}`);
    console.log("-".repeat(56));
    console.log("Query:", search.text);

    const url = new URL(ENDPOINT);

    url.searchParams.set("text", search.text);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("apiKey", apiKey);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });

      console.log("HTTP status:", response.status);

      const body = await response.text();

      if (!response.ok) {
        console.error("Request failed:");

        try {
          const errorData = JSON.parse(body);
          console.error(JSON.stringify(errorData, null, 2));
        } catch {
          console.error(body.slice(0, 1000));
        }

        summary.push({
          query: search.label,
          status: response.status,
          count: 0,
        });
      } else {
        let data: GeoapifyResponse;

        try {
          data = JSON.parse(body) as GeoapifyResponse;
        } catch {
          console.error("Response was not valid JSON:", body.slice(0, 1000));

          summary.push({
            query: search.label,
            status: "invalid JSON",
            count: 0,
          });

          continue;
        }

        const results = Array.isArray(data.results) ? data.results : [];

        console.log("Candidates returned:", results.length);

        if (results.length > 0) {
          console.log(JSON.stringify(results.map(summarize), null, 2));
        } else {
          console.log("No candidates returned for this query.");
        }

        summary.push({
          query: search.label,
          status: response.status,
          count: results.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      console.error("Network/request error:", message);

      summary.push({
        query: search.label,
        status: "error",
        count: 0,
      });
    }

    // Space requests to stay within the provider's rate limits.
    if (i < searches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  console.log("\n========================================");
  console.log("                  SUMMARY");
  console.log("========================================");

  console.table(summary);

  console.log(
    "\nIMPORTANT: Coordinates are candidates, not proof of an exact match.",
  );

  console.log(
    "Check the locality, district, state, and postcode before accepting a result.",
  );

  console.log(
    "A city-level result must not be saved as the exact village location.",
  );
}

main();
