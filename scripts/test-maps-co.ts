import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const API_ENDPOINT = "https://geocode.maps.co/search";

interface GeocodingResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: {
    village?: string;
    town?: string;
    city?: string;
    suburb?: string;
    county?: string;
    district?: string;
    state_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

interface TestCase {
  name: string;
  params: Record<string, string>;
}

const tests: TestCase[] = [
  {
    name: "1. Full locality without postcode",
    params: {
      q: "Arjunpur Angadpur, Durgapur, West Bengal, India",
    },
  },
  {
    name: "2. Angadpur locality",
    params: {
      q: "Angadpur, Durgapur, West Bengal, India",
    },
  },
  {
    name: "3. Arjun Pur locality",
    params: {
      q: "Arjun Pur, Durgapur, West Bengal, India",
    },
  },
  {
    name: "4. Arjunpur in West Bengal",
    params: {
      q: "Arjunpur, West Bengal, India",
    },
  },
  {
    name: "5. Durgapur city",
    params: {
      q: "Durgapur, West Bengal, India",
    },
  },
  {
    name: "6. Structured postcode search",
    params: {
      city: "Durgapur",
      state: "West Bengal",
      postalcode: "713215",
      country: "India",
    },
  },
];

function isValidCoordinatePair(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function main() {
  console.log("======================================");
  console.log("  GEOCODE.MAPS.CO ADDRESS TESTS");
  console.log("======================================\n");

  const apiKey = process.env.GEOCODE_MAPS_CO_API_KEY?.trim();

  if (!apiKey) {
    console.error("GEOCODE_MAPS_CO_API_KEY is missing.");
    console.error("Check your project-root .env file.");
    process.exitCode = 1;
    return;
  }

  const summary: Array<{
    test: string;
    resultCount: number;
    candidates: Array<{
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      village: string | null;
      town: string | null;
      city: string | null;
      district: string | null;
      state: string | null;
      postcode: string | null;
      type: string | null;
      importance: number | null;
    }>;
  }> = [];

  for (let index = 0; index < tests.length; index++) {
    const test = tests[index];

    console.log(`\n${test.name}`);
    console.log("-".repeat(50));
    console.log("Search:", JSON.stringify(test.params));

    const url = new URL(API_ENDPOINT);

    for (const [key, value] of Object.entries(test.params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "in");

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      });

      console.log("HTTP status:", response.status);

      const body = await response.text();

      if (!response.ok) {
        console.error("Request failed:", body.slice(0, 500));

        summary.push({
          test: test.name,
          resultCount: 0,
          candidates: [],
        });

        continue;
      }

      const data: unknown = JSON.parse(body);

      if (!Array.isArray(data)) {
        console.log("Unexpected response:", JSON.stringify(data));

        summary.push({
          test: test.name,
          resultCount: 0,
          candidates: [],
        });

        continue;
      }

      const candidates = (data as GeocodingResult[]).map((item) => {
        const latitude = item.lat !== undefined ? Number(item.lat) : NaN;

        const longitude = item.lon !== undefined ? Number(item.lon) : NaN;

        const coordinatesValid = isValidCoordinatePair(latitude, longitude);

        return {
          latitude: coordinatesValid ? latitude : null,
          longitude: coordinatesValid ? longitude : null,
          address: item.display_name ?? null,
          village: item.address?.village ?? null,
          town: item.address?.town ?? null,
          city: item.address?.city ?? null,
          district:
            item.address?.district ??
            item.address?.county ??
            item.address?.state_district ??
            null,
          state: item.address?.state ?? null,
          postcode: item.address?.postcode ?? null,
          type: item.type ?? item.class ?? null,
          importance: item.importance ?? null,
        };
      });

      console.log("Candidates found:", candidates.length);

      if (candidates.length > 0) {
        console.log(JSON.stringify(candidates, null, 2));
      } else {
        console.log("No matching locations.");
      }

      summary.push({
        test: test.name,
        resultCount: candidates.length,
        candidates,
      });
    } catch (error) {
      console.error(
        "Request error:",
        error instanceof Error ? error.message : "Unknown error",
      );

      summary.push({
        test: test.name,
        resultCount: 0,
        candidates: [],
      });
    }

    // Stay comfortably below the published 5 requests/second limit.
    if (index < tests.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  console.log("\n======================================");
  console.log("             SUMMARY");
  console.log("======================================");

  console.table(
    summary.map((item) => ({
      test: item.test,
      resultCount: item.resultCount,
    })),
  );

  console.log(
    "\nReview the candidates above before accepting any coordinates.",
  );
  console.log(
    "A city or postcode match is not necessarily an exact locality match.",
  );
}

main();
