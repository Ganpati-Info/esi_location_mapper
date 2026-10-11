import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DIGIPIN_ENDPOINT = "https://sdk.mappls.com/map/api/digipin";

// Existing eLoc returned by your Mappls Geocoding API.
const MAPPLS_PIN = "Y0J7DV";

interface DigipinResponse {
  digipin?: string;
  latitude?: number;
  longitude?: number;
  bounds?: number[][];
  error?: string;
  message?: string;
}

async function callDigipinApi(
  params: Record<string, string>,
  apiKey: string,
): Promise<DigipinResponse | null> {
  const url = new URL(DIGIPIN_ENDPOINT);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("access_token", apiKey);

  // Never log the URL because it contains the API key.
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  console.log("HTTP status:", response.status);

  if (response.status === 204) {
    console.log("No result returned by Mappls.");
    return null;
  }

  const body = await response.text();

  if (!response.ok) {
    console.error("Mappls DIGIPIN request failed.");

    try {
      const errorData = JSON.parse(body);
      console.error(JSON.stringify(errorData, null, 2));
    } catch {
      console.error(body.slice(0, 1000));
    }

    if (response.status === 401) {
      console.error(
        "Check whether DIGIPIN Conversion is enabled for your API key.",
      );
    }

    if (response.status === 403) {
      console.error("Check your Mappls usage limits and API allocation.");
    }

    throw new Error(`Mappls DIGIPIN API returned HTTP ${response.status}`);
  }

  try {
    return JSON.parse(body) as DigipinResponse;
  } catch {
    throw new Error("Mappls returned invalid JSON.");
  }
}

function validateCoordinates(data: DigipinResponse) {
  const latitude = data.latitude;
  const longitude = data.longitude;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function main() {
  console.log("========================================");
  console.log("       MAPPLS DIGIPIN API TEST");
  console.log("========================================\n");

  const apiKey = process.env.MAPPLS_ACCESS_TOKEN?.trim();

  if (!apiKey) {
    console.error("MAPPLS_ACCESS_TOKEN is missing from your environment.");
    console.error("Check your project-root .env file.");
    process.exitCode = 1;
    return;
  }

  console.log("API key found:", true);
  console.log("API key value: hidden");
  console.log("Input Mappls Pin:", MAPPLS_PIN);
  console.log("");

  try {
    // STEP 1: Convert the Mappls Pin into a DIGIPIN.
    console.log("STEP 1: Converting Mappls Pin to DIGIPIN");
    console.log("----------------------------------------");

    const conversion = await callDigipinApi({ mapplsPin: MAPPLS_PIN }, apiKey);

    if (!conversion) {
      console.log("No DIGIPIN was returned.");
      return;
    }

    console.log("Response:", JSON.stringify(conversion, null, 2));

    const digipin = conversion.digipin?.trim();

    if (!digipin) {
      console.error("The response did not contain a DIGIPIN.");
      return;
    }

    console.log("\nDIGIPIN obtained:", digipin);

    // STEP 2: Decode the DIGIPIN into coordinates.
    console.log("\nSTEP 2: Converting DIGIPIN to coordinates");
    console.log("----------------------------------------");

    const decoded = await callDigipinApi({ digipin }, apiKey);

    if (!decoded) {
      console.log("No coordinates were returned.");
      return;
    }

    console.log("Response:", JSON.stringify(decoded, null, 2));

    const coordinates = validateCoordinates(decoded);

    if (!coordinates) {
      console.log("\nRESULT: No valid coordinates were returned.");
      console.log(
        "Check the response, API allocation, and DIGIPIN documentation.",
      );
      return;
    }

    console.log("\n========================================");
    console.log("SUCCESS: COORDINATES RETURNED");
    console.log("========================================");

    console.log("Original Mappls Pin:", MAPPLS_PIN);
    console.log("DIGIPIN:", digipin);
    console.log("Latitude:", coordinates.latitude);
    console.log("Longitude:", coordinates.longitude);

    if (decoded.bounds) {
      console.log("DIGIPIN grid bounds:", JSON.stringify(decoded.bounds));
    }

    console.log("\nImportant:");
    console.log("These coordinates represent the DIGIPIN grid location.");
    console.log(
      "They do not independently prove that the original address was matched correctly.",
    );
  } catch (error) {
    console.error("\nTest failed.");

    console.error(
      error instanceof Error ? error.message : "An unexpected error occurred.",
    );

    process.exitCode = 1;
  }
}

main();
