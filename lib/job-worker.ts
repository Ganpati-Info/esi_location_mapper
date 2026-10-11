import { db } from "@/lib/db";
import { processRecord } from "@/lib/process";

const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 10;

type QueueRow = {
  id: string;
  upload_job_id: string;
  source_row_number: number;
  original_address: string | null;
  ro_sro: string | null;
  branch_office: string | null;
  source_file_name: string | null;
  phone_number: string | null;
  recipient_name: string | null;
  attempts: number;
};

function requireDatabase() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

/**
 * Claims one queued row atomically.
 *
 * SKIP LOCKED allows multiple workers to run without claiming
 * the same pending row at the same time.
 */
async function claimNextRow(): Promise<QueueRow | null> {
  const pool = requireDatabase();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<QueueRow>(
      `
      SELECT
        r.id,
        r.upload_job_id,
        r.source_row_number,
        r.original_address,
        r.ro_sro,
        r.branch_office,
        r.source_file_name,
        r.phone_number,
        r.recipient_name,
        r.attempts
      FROM upload_job_rows AS r
      INNER JOIN upload_jobs AS j
        ON j.id = r.upload_job_id
      WHERE
        j.status IN ('pending', 'processing')
        AND r.attempts < $1
        AND (
          r.processing_status = 'pending'
          OR (
            r.processing_status = 'processing'
            AND r.locked_at <
              NOW() - ($2 * INTERVAL '1 minute')
          )
        )
      ORDER BY r.id
      FOR UPDATE OF r SKIP LOCKED
      LIMIT 1
      `,
      [MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES],
    );

    const row = result.rows[0];

    if (!row) {
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
      UPDATE upload_job_rows
      SET
        processing_status = 'processing',
        locked_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
      WHERE id = $1
      `,
      [row.id],
    );

    await client.query(
      `
      UPDATE upload_jobs
      SET
        status = 'processing',
        updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'processing')
      `,
      [row.upload_job_id],
    );

    await client.query("COMMIT");

    return {
      ...row,
      attempts: row.attempts + 1,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Updates job counters using the actual queue-row states.
 */
async function refreshJobCounters(jobId: string) {
  const pool = requireDatabase();

  await pool.query(
    `
    UPDATE upload_jobs AS j
    SET
      processed_rows = counts.processed_count,
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
        )::integer AS processed_count,

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

/**
 * Saves the result of one claimed row.
 */
async function processClaimedRow(row: QueueRow) {
  const pool = requireDatabase();

  try {
    if (!row.original_address?.trim()) {
      throw new Error("The queued row has no address.");
    }

    const record = await processRecord({
      originalAddress: row.original_address,
      phoneNumber: row.phone_number,
      recipientName: row.recipient_name,
      roSro: row.ro_sro,
      branchOffice: row.branch_office,
      sourceRowNumber: row.source_row_number,
      sourceFileName: row.source_file_name ?? undefined,
    });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const insertResult = await client.query<{ id: string }>(
        `
        INSERT INTO location_records (
          original_address,
          full_address,
          recipient_name,
          village_name,
          landmark,
          tehsil_taluka,
          block_name,
          police_station_name,
          district,
          state,
          post_office_name,
          pin_code,
          phone_number,
          ro_sro,
          branch_office,
          latitude,
          longitude,
          normalization_provider,
          geocode_provider,
          confidence_score,
          status,
          error_message,
          source_row_number,
          source_file_name
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22,
          $23, $24
        )
        RETURNING id
        `,
        [
          record.original_address,
          record.full_address,
          record.recipient_name,
          record.village_name,
          record.landmark,
          record.tehsil_taluka,
          record.block_name,
          record.police_station_name,
          record.district,
          record.state,
          record.post_office_name,
          record.pin_code,
          record.phone_number,
          record.ro_sro,
          record.branch_office,
          record.latitude,
          record.longitude,
          record.normalization_provider,
          record.geocode_provider,
          record.confidence_score,
          record.status,
          record.error_message,
          record.source_row_number,
          record.source_file_name,
        ],
      );

      const locationId = insertResult.rows[0]?.id;

      if (!locationId) {
        throw new Error("Failed to save the processed location.");
      }

      if (record.status === "review" || record.status === "unresolved") {
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
            $9, $10, $11, $12, $13, $14, 'pending',
            $15, $16, $17
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
            record.status === "unresolved"
              ? "unresolved_address"
              : "low_confidence",
            record.status === "unresolved"
              ? "No usable coordinates were returned by the geocoder."
              : `Confidence score ${record.confidence_score} is below the processing threshold.`,
            row.attempts,
            record.source_row_number,
            record.source_file_name,
          ],
        );
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
          AND processing_status = 'processing'
        `,
        [queueStatus, locationId, row.id],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Address processing failed.";

    const nextStatus = row.attempts >= MAX_ATTEMPTS ? "error" : "pending";

    await pool.query(
      `
      UPDATE upload_job_rows
      SET
        processing_status = $1,
        error_message = $2,
        locked_at = NULL,
        updated_at = NOW()
      WHERE id = $3
      `,
      [nextStatus, message.slice(0, 2000), row.id],
    );
  } finally {
    await refreshJobCounters(row.upload_job_id);
  }
}

export async function recoverExhaustedRows(): Promise<number> {
  const pool = requireDatabase();

  const result = await pool.query(
    `
    UPDATE upload_job_rows
    SET
      processing_status = 'error',
      error_message = COALESCE(
        error_message,
        'Maximum processing attempts reached. Manual retry is required.'
      ),
      locked_at = NULL,
      updated_at = NOW()
    WHERE attempts >= $1
      AND (
        processing_status = 'pending'
        OR (
          processing_status = 'processing'
          AND locked_at < NOW() - ($2 * INTERVAL '1 minute')
        )
      )
    RETURNING upload_job_id
    `,
    [MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES],
  );

  const affectedJobIds = [
    ...new Set(
      result.rows.map((row: { upload_job_id: string | number }) =>
        String(row.upload_job_id),
      ),
    ),
  ];

  for (const jobId of affectedJobIds) {
    await refreshJobCounters(jobId);
  }

  return result.rowCount ?? 0;
}

/**
 * Processes up to `limit` rows from the durable queue.
 */
export async function processQueueBatch(limit = 5) {
  requireDatabase();

  const recovered = await recoverExhaustedRows();

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  let claimed = 0;

  for (let i = 0; i < safeLimit; i++) {
    const row = await claimNextRow();

    if (!row) {
      break;
    }

    claimed++;
    await processClaimedRow(row);
  }

  return { claimed, recovered };
}
