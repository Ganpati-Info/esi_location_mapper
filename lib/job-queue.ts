import { db } from "@/lib/db";
import type { PoolClient } from "pg";

export interface QueueRowInput {
  sourceRowNumber: number;
  originalAddress: string;
  roSro?: string | null;
  branchOffice?: string | null;
  phoneNumber?: string | null;
  recipientName?: string | null;
  sourceFileName: string;
  sourceRowData: Record<string, unknown>;
}

export interface CreateJobInput {
  fileName: string;
  rows: QueueRowInput[];
}

export interface CreatedJob {
  id: number;
  fileName: string;
  totalRows: number;
  status: string;
}

function requireDatabase() {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not configured. Upload processing requires PostgreSQL.",
    );
  }

  return db;
}

/**
 * Create an upload job and stage all its rows atomically.
 */
export async function createUploadJob(
  input: CreateJobInput,
): Promise<CreatedJob> {
  const pool = requireDatabase();
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    const jobResult = await client.query<{
      id: string;
      file_name: string;
      status: string;
    }>(
      `
      INSERT INTO upload_jobs (
        file_name,
        total_rows,
        processed_rows,
        review_rows,
        unresolved_rows,
        error_rows,
        status,
        last_processed_row
      )
      VALUES ($1, $2, 0, 0, 0, 0, $3, 0)
      RETURNING id, file_name, status
      `,
      [
        input.fileName,
        input.rows.length,
        input.rows.length > 0 ? "pending" : "completed",
      ],
    );

    const job = jobResult.rows[0];

    if (!job) {
      throw new Error("Failed to create upload job.");
    }

    await client.query(
      `
      INSERT INTO upload_job_rows (
        upload_job_id,
        source_row_number,
        original_address,
        ro_sro,
        branch_office,
        source_file_name,
        processing_status,
        error_message,
        attempts,
        source_row_data,
        phone_number,
        recipient_name
      )
      SELECT
        $1,
        staged.source_row_number,
        staged.original_address,
        staged.ro_sro,
        staged.branch_office,
        staged.source_file_name,
        'pending',
        NULL,
        0,
        staged.source_row_data,
        staged.phone_number,
        staged.recipient_name
      FROM jsonb_to_recordset($2::jsonb) AS staged(
        source_row_number integer,
        original_address text,
        ro_sro text,
        branch_office text,
        source_file_name text,
        source_row_data jsonb,
        phone_number text,
        recipient_name text
      )
      `,
      [
        job.id,
        JSON.stringify(
          input.rows.map((row) => ({
            source_row_number: row.sourceRowNumber,
            original_address: row.originalAddress,
            ro_sro: row.roSro ?? null,
            branch_office: row.branchOffice ?? null,
            source_file_name: row.sourceFileName,
            source_row_data: row.sourceRowData,
            phone_number: row.phoneNumber ?? null,
            recipient_name: row.recipientName ?? null,
          })),
        ),
      ],
    );

    await client.query("COMMIT");

    return {
      id: Number(job.id),
      fileName: job.file_name,
      totalRows: input.rows.length,
      status: job.status,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieve the current status of an upload job.
 */
export async function getUploadJob(jobId: number) {
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new Error("Invalid upload job ID.");
  }

  const pool = requireDatabase();

  const result = await pool.query(
    `
    SELECT
      id,
      file_name,
      total_rows,
      processed_rows,
      review_rows,
      unresolved_rows,
      error_rows,
      status,
      last_processed_row,
      error_message,
      created_at,
      updated_at
    FROM upload_jobs
    WHERE id = $1
    `,
    [jobId],
  );

  return result.rows[0] ?? null;
}
