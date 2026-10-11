import { loadEnvConfig } from "@next/env";
import type { PoolClient } from "pg";

// IMPORTANT: Load .env before importing the database module.
loadEnvConfig(process.cwd());

const SOURCE_FILE = "mix_20.xlsx";
const DELAY_MS = 1200;

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

type ProcessedRecord = Awaited<
  ReturnType<(typeof import("../lib/process"))["processRecord"]>
>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("========================================");
  console.log(" EXISTING DATABASE REPROCESSING");
  console.log("========================================\n");

  console.log("Source file:", SOURCE_FILE);
  console.log("Mode: Update existing records");
  console.log("Coordinate provider: Gemini");
  console.log("Delay between records:", DELAY_MS, "ms");
  console.log("");

  // The database module must be imported only AFTER loadEnvConfig.
  const databaseUrl =
    process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "No database URL was found. Check DATABASE_URL_POOLED " +
        "or DATABASE_URL in your project-root .env file.",
    );
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(
      "GEMINI_API_KEY was not found in your project-root .env file.",
    );
  }

  const { db } = await import("../lib/db");
  const { processRecord } = await import("../lib/process");

  if (!db) {
    throw new Error(
      "The database module did not create a connection pool. " +
        "Check lib/db.ts and your environment configuration.",
    );
  }

  const sourceResult = await db.query<QueueRow>(
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
    ORDER BY r.source_row_number
    `,
    [SOURCE_FILE],
  );

  const rows = sourceResult.rows;

  if (rows.length === 0) {
    throw new Error(
      `No queued rows were found for ${SOURCE_FILE}. ` +
        "Verify the filename in upload_jobs and upload_job_rows.",
    );
  }

  console.log(`Found ${rows.length} existing queued rows.`);
  console.log("No new upload will be created.\n");

  const affectedJobIds = new Set(rows.map((row) => String(row.upload_job_id)));

  let succeeded = 0;
  let failed = 0;
  let withCoordinates = 0;
  let withoutCoordinates = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];

    console.log(
      `\n[${index + 1}/${rows.length}] ` + `Excel row ${row.source_row_number}`,
    );

    console.log("Address:", row.original_address);

    if (!row.original_address?.trim()) {
      console.log("SKIPPED: Empty original address.");
      continue;
    }

    let client: PoolClient | undefined;

    try {
      const record = await processRecord({
        originalAddress: row.original_address,
        phoneNumber: row.phone_number,
        recipientName: row.recipient_name,
        roSro: row.ro_sro,
        branchOffice: row.branch_office,
        sourceRowNumber: row.source_row_number,
        sourceFileName: row.source_file_name ?? SOURCE_FILE,
      });

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

      client = await db.connect();

      await client.query("BEGIN");

      let locationId: string | number | null = row.location_record_id;

      // Find an existing record if the queue doesn't have a linked ID.
      if (!locationId) {
        const existing = await client.query<{ id: string | number }>(
          `
          SELECT id
          FROM location_records
          WHERE source_file_name = $1
            AND source_row_number = $2
          ORDER BY id DESC
          LIMIT 1
          `,
          [row.source_file_name ?? SOURCE_FILE, row.source_row_number],
        );

        locationId = existing.rows[0]?.id ?? null;
      }

      const values = LOCATION_COLUMNS.map((column) => {
        return record[column];
      });

      if (locationId !== null) {
        // UPDATE the existing record. Do not create a duplicate.
        const assignments = LOCATION_COLUMNS.map(
          (column, columnIndex) => `${column} = $${columnIndex + 2}`,
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
        // No existing record: insert one and link it to the queue row.
        const placeholders = LOCATION_COLUMNS.map(
          (_, index) => `$${index + 1}`,
        ).join(", ");

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
          throw new Error("Failed to insert the location record.");
        }
      }

      const reviewCategory =
        record.status === "unresolved"
          ? "unresolved_address"
          : "low_confidence";

      const reviewReason = hasCoordinates
        ? [
            "Coordinates were generated by Gemini and are not independently verified.",
            `Reported precision: ${
              "coordinate_precision" in record
                ? String(record.coordinate_precision)
                : "unknown"
            }.`,
            `Coordinate confidence: ${record.confidence_score ?? 0}/100.`,
            "Please verify the coordinates before approving this record.",
          ].join(" ")
        : [
            "Gemini could not provide a usable coordinate pair.",
            record.error_message ?? "No additional reason was returned.",
          ].join(" ");

      // Refresh any EXISTING pending review entries for this source row.
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
          row.source_file_name ?? SOURCE_FILE,
          row.source_row_number,
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
        // Do not overwrite an existing approved, rejected, or resolved
        // review decision.
        const existingReview = await client.query<{ id: number }>(
          `
          SELECT id
          FROM location_review_records
          WHERE source_file_name = $1
            AND source_row_number = $2
          ORDER BY id DESC
          LIMIT 1
          `,
          [row.source_file_name ?? SOURCE_FILE, row.source_row_number],
        );

        if (existingReview.rows.length === 0) {
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
              row.source_row_number,
              row.source_file_name ?? SOURCE_FILE,
            ],
          );
        } else {
          console.log("An existing non-pending review decision was preserved.");
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

      succeeded++;

      if (hasCoordinates) {
        withCoordinates++;
      } else {
        withoutCoordinates++;
      }

      console.log("Saved: existing record refreshed.");
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original processing error.
        }
      }

      failed++;

      const message =
        error instanceof Error ? error.message : "Unknown processing error.";

      console.error("FAILED:", message);

      // Keep the row retryable only through an explicit subsequent retry.
      // Do not delete or modify its previously saved location record.
      try {
        await db.query(
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
      } catch (queueError) {
        console.error(
          "Could not update queue error status:",
          queueError instanceof Error ? queueError.message : "Unknown error",
        );
      }
    } finally {
      client?.release();
    }

    if (index < rows.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Refresh aggregate counters for each affected upload job.
  for (const jobId of affectedJobIds) {
    await db.query(
      `
      UPDATE upload_jobs AS j
      SET
        processed_rows = counts.completed_count,
        review_rows = counts.review_count,
        unresolved_rows = counts.unresolved_count,
        error_rows = counts.error_count,
        last_processed_row = counts.last_row,
        status = CASE
          WHEN counts.pending_count = 0
            AND counts.processing_count = 0
            AND counts.error_count = 0
            THEN 'completed'
          WHEN counts.pending_count = 0
            AND counts.processing_count = 0
            AND counts.error_count > 0
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
      ) AS counts
      WHERE j.id = $1
      `,
      [jobId],
    );
  }

  console.log("\n========================================");
  console.log(" REPROCESSING SUMMARY");
  console.log("========================================");
  console.log("Source file:", SOURCE_FILE);
  console.log("Rows found:", rows.length);
  console.log("Rows successfully saved:", succeeded);
  console.log("Rows with coordinates:", withCoordinates);
  console.log("Rows without coordinates:", withoutCoordinates);
  console.log("Rows that failed:", failed);
  console.log("New upload created: No");
  console.log("Existing database records updated in place.");
  console.log("========================================\n");

  await db.end();

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nREPROCESSING ABORTED:");

  console.error(
    error instanceof Error ? (error.stack ?? error.message) : "Unknown error",
  );

  process.exitCode = 1;
});
