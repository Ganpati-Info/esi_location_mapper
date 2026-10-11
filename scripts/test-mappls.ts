import { loadEnvConfig } from "@next/env";
import { checkMapplsAccess, mapplsGeocode } from "../lib/mappls";

// Load environment variables from .env files in the project root.
loadEnvConfig(process.cwd());

async function main() {
  console.log("================================");
  console.log("       MAPPLS API TEST");
  console.log("================================\n");

  // Check whether the API token is configured without printing it.
  if (!process.env.MAPPLS_ACCESS_TOKEN) {
    console.error("MAPPLS_ACCESS_TOKEN is missing.");
    console.error("Check your .env.local or .env file.");
    process.exitCode = 1;
    return;
  }

  console.log("Step 1: Checking Mappls API access...");

  try {
    const access = await checkMapplsAccess();
    console.log("Access result:", access);

    if (!access.ok) {
      console.error("\nMappls access check failed.");
      process.exitCode = 1;
      return;
    }

    console.log("\nStep 2: Testing address geocoding...");

    const result = await mapplsGeocode(
      "Arjunpur Angadpur, Durgapur, Paschim Bardhaman, West Bengal 713215",
    );

    console.log("\nGeocoding result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.latitude === null || result.longitude === null) {
      console.error("\nNo coordinates were returned.");
      console.error("We need to inspect the raw Mappls response.");
      process.exitCode = 1;
      return;
    }

    console.log("\nSUCCESS: Coordinates received.");
    console.log("Latitude:", result.latitude);
    console.log("Longitude:", result.longitude);
  } catch (error) {
    console.error("\nMappls test failed:");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }

    process.exitCode = 1;
  }
}

main();
