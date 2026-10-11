import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const PLACE_DETAILS_ENDPOINT =
  "https://place.mappls.com/O2O/entity/place-details";

const EL0C = "Y0J7DV";

function findCoordinates(data: any): {
  latitude: number | null;
  longitude: number | null;
} {
  const latitudeValue =
    data?.latitude ??
    data?.lat ??
    data?.location?.latitude ??
    data?.location?.lat;

  const longitudeValue =
    data?.longitude ??
    data?.lon ??
    data?.lng ??
    data?.location?.longitude ??
    data?.location?.lon ??
    data?.location?.lng;

  const latitude =
    latitudeValue !== null &&
    latitudeValue !== undefined &&
    latitudeValue !== ""
      ? Number(latitudeValue)
      : NaN;

  const longitude =
    longitudeValue !== null &&
    longitudeValue !== undefined &&
    longitudeValue !== ""
      ? Number(longitudeValue)
      : NaN;

  return {
    latitude:
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        ? latitude
        : null,

    longitude:
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
        ? longitude
        : null,
  };
}

async function main() {
  console.log("======================================");
  console.log(" MAPPLS PLACE DETAILS API TEST");
  console.log("======================================\n");

  const token = process.env.MAPPLS_ACCESS_TOKEN?.trim();

  if (!token) {
    console.error("ERROR: MAPPLS_ACCESS_TOKEN was not found.");
    console.error("Check that your .env file is in the project root.");
    process.exitCode = 1;
    return;
  }

  console.log("Step 1: Environment configuration");
  console.log("Access token found:", Boolean(token));
  console.log("Token length:", token.length);
  console.log("Token value: [hidden]");
  console.log("");

  console.log("Step 2: Requesting Place Details");
  console.log("eLoc:", EL0C);
  console.log("");

  const url = new URL(`${PLACE_DETAILS_ENDPOINT}/${encodeURIComponent(EL0C)}`);

  // Mappls documents this endpoint for static-key authentication.
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    console.log("HTTP status:", response.status);
    console.log("HTTP status text:", response.statusText);
    console.log("");

    if (response.status === 204) {
      console.log("No Place Details were returned for this eLoc.");
      return;
    }

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Mappls API request failed.");

      // Avoid printing the request URL because it contains the token.
      try {
        const errorData = JSON.parse(responseText);
        console.error("Response:", JSON.stringify(errorData, null, 2));
      } catch {
        console.error("Response:", responseText.slice(0, 1000));
      }

      console.error(
        "\nCheck the API endpoint, token type, and Mappls API permissions.",
      );

      process.exitCode = 1;
      return;
    }

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("Mappls returned a response that is not valid JSON.");
      console.error("Response preview:", responseText.slice(0, 1000));
      process.exitCode = 1;
      return;
    }

    console.log("Step 3: API response");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    console.log("Step 4: Coordinate extraction");

    const coordinates = findCoordinates(data);

    console.log("Latitude:", coordinates.latitude);
    console.log("Longitude:", coordinates.longitude);
    console.log("");

    if (coordinates.latitude !== null && coordinates.longitude !== null) {
      console.log("SUCCESS: Coordinates were returned!");
      console.log(
        `Coordinates: ${coordinates.latitude}, ${coordinates.longitude}`,
      );
      console.log(
        "\nNext step: integrate the Place Details request into lib/mappls.ts.",
      );
    } else {
      console.log("NO COORDINATES FOUND IN THE RESPONSE.");
      console.log(
        "The API may return place details without coordinate fields.",
      );
      console.log(
        "Check the response above and your Mappls Location Coordinates entitlement.",
      );
    }
  } catch (error) {
    console.error("Network or request error:");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("An unknown error occurred.");
    }

    process.exitCode = 1;
  }
}

main();
