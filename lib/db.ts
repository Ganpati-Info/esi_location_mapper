import { Pool, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var locationConnectPool: Pool | undefined;
}

function createPool(): Pool | undefined {
  const connectionString =
    process.env.DATABASE_URL_POOLED?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return undefined;
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  pool.on("error", (error) => {
    console.error("Unexpected Neon PostgreSQL pool error:", error.message);
  });

  return pool;
}

function hasDatabaseConfiguration(): boolean {
  const connectionString =
    process.env.DATABASE_URL_POOLED?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return false;
  }

  return (
    connectionString.startsWith("postgresql://") ||
    connectionString.startsWith("postgres://")
  );
}

export const db: Pool | undefined =
  global.locationConnectPool ??
  (hasDatabaseConfiguration() ? createPool() : undefined);

if (process.env.NODE_ENV !== "production" && db) {
  global.locationConnectPool = db;
}

/**
 * Check database connectivity.
 *
 * This is useful for the health endpoint.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (!db) {
    return false;
  }

  const client = await db.connect();

  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

/**
 * Get the name of the currently connected database.
 */
export async function getDatabaseName(): Promise<string | null> {
  if (!db) {
    return null;
  }

  const result = await db.query<{ database_name: string }>(
    "SELECT current_database() AS database_name"
  );

  return result.rows[0]?.database_name ?? null;
}