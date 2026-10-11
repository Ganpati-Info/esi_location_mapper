import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

// Load .env and .env.local before importing application modules.
loadEnvConfig(process.cwd());

const SOURCE_FILE = "mix_20.xlsx";
const DELAY_MS = 1500;

const LOCATION_COLUMNS = [
  "original_address",
  "full_address",
  "recipient_name",
  "village_name",
  "landmark",
  "tehsil_taluka",
  "block_name",
  "police_station_name",
  "district",
  "state",
  "post_office_name",
  "pin_code",
  "phone_number",
  "ro_sro",
  "branch_office",
  "latitude",
  "longitude",
  "normalization_provider",
  "geocode_provider",
  "confidence_score",
  "status",
  "error_message",
  "source_row_number",
  "source_file_name",
] as const;

type LocationColumn = (typeof LOCATION_COLUMNS)[number];

type QueueRow = {
  id: string | number;
  upload_job_id: string | number;
  source_row_number: number;
  original_address: string | null;
  phone_number: string | null;
  recipient_name: string | null;
  ro_sro: string | null;
  branch_office: string | null;
  source_file_name: string | null;
  location_record_id: string | number | null;
  attempts: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("========================================");
  console.log(" REPROCESS AND SAVE EXISTING LOCATIONS");
  console.log("========================================");

  const connectionString =
    process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "Database URL not found. Check DATABASE_URL_POOLED or " +
        "DATABASE_URL in the project-root .env or .env.local file.",
    );
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is missing from .env or .env.local.");
  }

  // Create a dedicated database pool for this script.
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  try {
    // Verify connectivity before modifying anything.
    const health = await pool.query(
      "SELECT current_database() AS database_name",
    );

    console.log("Database connected:", health.rows[0].database_name);
    console.log("Source file:", SOURCE_FILE);

    // Import only after environment variables have been loaded.
    const { processRecord } = await import("../lib/process");

    const result = await pool.query<QueueRow>(
      `
      SELECT
        r.id,
        r.upload_job_id,
        r.source_row_number,
        r.original_address,
        r.phone_number,
        r.recipient_name,
        r.ro_sro,
        r.branch_office,
        COALESCE(r.source_file_name, j.file_name) AS source_file_name,
        r.location_record_id,
        r.attempts
      FROM upload_job_rows AS r
      INNER JOIN upload_jobs AS j
        ON j.id = r.upload_job_id
      WHERE COALESCE(r.source_file_name, j.file_name) = $1
      ORDER BY r.source_row_number, r.id
      `,
      [SOURCE_FILE],
    );

    const rows = result.rows;

    if (rows.length === 0) {
      throw new Error(
        `No rows found for ${SOURCE_FILE}. Check the filename in upload_jobs.`,
      );
    }

    console.log(`Existing source rows found: ${rows.length}`);
    console.log("Reprocessing these rows without uploading the file again.\n");

    const affectedJobs = new Set(rows.map((row) => String(row.upload_job_id)));

    let saved = 0;
    let filtered = 0;
    let withCoordinates = 0;
    let withoutCoordinates = 0;
    let errors = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const sourceFile = row.source_file_name ?? SOURCE_FILE;
      const sourceRow = row.source_row_number;

      console.log(`\n[${index + 1}/${rows.length}] Excel row ${sourceRow}`);

      console.log("Original address:", row.original_address ?? "(empty)");

      let client: Awaited<ReturnType<typeof pool.connect>> | undefined;

      try {
        let record;

        if (!row.original_address?.trim()) {
          // Do not ask Gemini to invent a location for a blank address.
          record = {
            original_address: "",
            full_address: null,
            recipient_name: row.recipient_name,
            village_name: null,
            landmark: null,
            tehsil_taluka: null,
            block_name: null,
            police_station_name: null,
            district: null,
            state: null,
            post_office_name: null,
            pin_code: null,
            phone_number: row.phone_number,
            ro_sro: row.ro_sro,
            branch_office: row.branch_office,
            latitude: null,
            longitude: null,
            normalization_provider: null,
            geocode_provider: "filtered-empty-address",
            confidence_score: 0,
            status: "unresolved",
            error_message: "Filtered: original address is empty.",
            source_row_number: sourceRow,
            source_file_name: sourceFile,
          };
        } else {
          record = await processRecord({
            originalAddress: row.original_address,
            phoneNumber: row.phone_number,
            recipientName: row.recipient_name,
            roSro: row.ro_sro,
            branchOffice: row.branch_office,
            sourceRowNumber: sourceRow,
            sourceFileName: sourceFile,
          });
        }

        const hasCoordinates =
          typeof record.latitude === "number" &&
          typeof record.longitude === "number" &&
          Number.isFinite(record.latitude) &&
          Number.isFinite(record.longitude);

        console.log("District:", record.district ?? "Unknown");
        console.log("State:", record.state ?? "Unknown");
        console.log("Latitude:", record.latitude);
        console.log("Longitude:", record.longitude);
        console.log("Provider:", record.geocode_provider);
        console.log("Status:", record.status);

        if (record.status === "unresolved") {
          filtered++;
        }

        client = await pool.connect();

        await client.query("BEGIN");

        // First use the linked record ID. If absent, find the record
        // by its original file and spreadsheet row.
        let locationId: string | number | null = row.location_record_id;

        if (!locationId) {
          const existing = await client.query<{ id: string | number }>(
            `
            SELECT id
            FROM location_records
            WHERE source_file_name = $1
              AND source_row_number = $2
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
            `,
            [sourceFile, sourceRow],
          );

          locationId = existing.rows[0]?.id ?? null;
        } else {
          const linked = await client.query<{ id: string | number }>(
            `
            SELECT id
            FROM location_records
            WHERE id = $1
            FOR UPDATE
            `,
            [locationId],
          );

          if (linked.rows.length === 0) {
            locationId = null;
          }
        }

        const values = LOCATION_COLUMNS.map(
          (column) => record[column as LocationColumn],
        );

        if (locationId !== null) {
          // Update the existing location instead of creating a duplicate.
          const assignments = LOCATION_COLUMNS.map(
            (column, i) => `${column} = $${i + 2}`,
          ).join(", ");

          const updated = await client.query<{ id: string | number }>(
            `
            UPDATE location_records
            SET ${assignments},
                updated_at = NOW()
            WHERE id = $1
            RETURNING id
            `,
            [locationId, ...values],
          );

          if (updated.rows.length === 0) {
            locationId = null;
          } else {
            locationId = updated.rows[0].id;
          }
        }

        if (locationId === null) {
          // Insert only when no matching location record exists.
          const placeholders = LOCATION_COLUMNS.map((_, i) => `$${i + 1}`).join(
            ", ",
          );

          const inserted = await client.query<{ id: string | number }>(
            `
            INSERT INTO location_records (
              ${LOCATION_COLUMNS.join(", ")}
            )
            VALUES (${placeholders})
            RETURNING id
            `,
            values,
          );

          locationId = inserted.rows[0]?.id ?? null;

          if (locationId === null) {
            throw new Error("Failed to save the location record.");
          }
        }

        const reviewCategory =
          record.status === "unresolved"
            ? "unresolved_address"
            : "low_confidence";

        const reviewReason =
          record.error_message ??
          "Gemini-generated coordinates are unverified estimates.";

        // Refresh only pending review entries. Previously approved,
        // rejected, or resolved decisions are not overwritten.
        const reviewUpdate = await client.query(
          `
          UPDATE location_review_records
          SET
            original_address = $3,
            ro_sro = $4,
            branch_office = $5,
            candidate_locality = $6,
            candidate_post_office = $7,
            candidate_police_station = $8,
            candidate_block = $9,
            candidate_district = $10,
            candidate_state = $11,
            candidate_pin_code = $12,
            candidate_latitude = $13,
            candidate_longitude = $14,
            review_category = $15,
            review_reason = $16,
            processing_attempts = $17
          WHERE source_file_name = $1
            AND source_row_number = $2
            AND review_status = 'pending'
          `,
          [
            sourceFile,
            sourceRow,
            record.original_address,
            record.ro_sro,
            record.branch_office,
            record.village_name,
            record.post_office_name,
            record.police_station_name,
            record.block_name,
            record.district,
            record.state,
            record.pin_code,
            record.latitude,
            record.longitude,
            reviewCategory,
            reviewReason,
            row.attempts,
          ],
        );

        if ((reviewUpdate.rowCount ?? 0) === 0) {
          const previousReview = await client.query(
            `
            SELECT id
            FROM location_review_records
            WHERE source_file_name = $1
              AND source_row_number = $2
            LIMIT 1
            `,
            [sourceFile, sourceRow],
          );

          if (previousReview.rows.length === 0) {
            await client.query(
              `
              INSERT INTO location_review_records (
                original_address,
                ro_sro,
                branch_office,
                candidate_locality,
                candidate_post_office,
                candidate_police_station,
                candidate_block,
                candidate_district,
                candidate_state,
                candidate_pin_code,
                candidate_latitude,
                candidate_longitude,
                review_category,
                review_reason,
                review_status,
                processing_attempts,
                source_row_number,
                source_file_name
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14,
                'pending', $15, $16, $17
              )
              `,
              [
                record.original_address,
                record.ro_sro,
                record.branch_office,
                record.village_name,
                record.post_office_name,
                record.police_station_name,
                record.block_name,
                record.district,
                record.state,
                record.pin_code,
                record.latitude,
                record.longitude,
                reviewCategory,
                reviewReason,
                row.attempts,
                sourceRow,
                sourceFile,
              ],
            );
          }
        }

        const queueStatus =
          record.status === "review"
            ? "review"
            : record.status === "unresolved"
              ? "unresolved"
              : "completed";

        await client.query(
          `
          UPDATE upload_job_rows
          SET
            processing_status = $1,
            location_record_id = $2,
            error_message = NULL,
            locked_at = NULL,
            updated_at = NOW()
          WHERE id = $3
          `,
          [queueStatus, locationId, row.id],
        );

        await client.query("COMMIT");

        saved++;

        if (hasCoordinates) {
          withCoordinates++;
        } else {
          withoutCoordinates++;
        }

        console.log("Saved to PostgreSQL successfully.");
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Preserve the original error.
          }
        }

        errors++;

        const message =
          error instanceof Error ? error.message : "Unknown processing error.";

        console.error("Row processing failed:", message);

        // Leave the row available for explicit retry.
        await pool.query(
          `
          UPDATE upload_job_rows
          SET
            processing_status = 'error',
            error_message = $1,
            locked_at = NULL,
            updated_at = NOW()
          WHERE id = $2
          `,
          [message.slice(0, 2000), row.id],
        );
      } finally {
        client?.release();
      }

      if (index < rows.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    // Refresh the counters on every affected upload job.
    for (const jobId of affectedJobs) {
      await pool.query(
        `
        UPDATE upload_jobs AS j
        SET
          processed_rows = c.completed_count,
          review_rows = c.review_count,
          unresolved_rows = c.unresolved_count,
          error_rows = c.error_count,
          last_processed_row = c.last_row,
          status = CASE
            WHEN c.pending_count = 0
              AND c.processing_count = 0
              AND c.error_count = 0
              THEN 'completed'
            WHEN c.pending_count = 0
              AND c.processing_count = 0
              AND c.error_count > 0
              THEN 'failed'
            ELSE 'processing'
          END,
          updated_at = NOW()
        FROM (
          SELECT
            COUNT(*) FILTER (
              WHERE processing_status = 'completed'
            )::integer AS completed_count,
            COUNT(*) FILTER (
              WHERE processing_status = 'review'
            )::integer AS review_count,
            COUNT(*) FILTER (
              WHERE processing_status = 'unresolved'
            )::integer AS unresolved_count,
            COUNT(*) FILTER (
              WHERE processing_status = 'error'
            )::integer AS error_count,
            COUNT(*) FILTER (
              WHERE processing_status = 'pending'
            )::integer AS pending_count,
            COUNT(*) FILTER (
              WHERE processing_status = 'processing'
            )::integer AS processing_count,
            COALESCE(MAX(source_row_number), 0)::integer AS last_row
          FROM upload_job_rows
          WHERE upload_job_id = $1
        ) AS c
        WHERE j.id = $1
        `,
        [jobId],
      );
    }

    console.log("\n========================================");
    console.log(" DATABASE REPROCESSING COMPLETE");
    console.log("========================================");
    console.log("Rows selected:", rows.length);
    console.log("Rows saved:", saved);
    console.log("Rows with coordinates:", withCoordinates);
    console.log("Rows without coordinates:", withoutCoordinates);
    console.log("Rows filtered/unresolved:", filtered);
    console.log("Rows with errors:", errors);
    console.log("Original upload preserved:", "Yes");
    console.log("New upload created:", "No");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nREPROCESSING FAILED:");

  console.error(
    error instanceof Error ? (error.stack ?? error.message) : "Unknown error",
  );

  process.exitCode = 1;
});
