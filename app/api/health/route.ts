import { NextResponse } from "next/server";
import { db, getDatabaseName, checkDatabaseConnection } from "@/lib/db";
import { checkMapplsAccess } from "@/lib/mappls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mapplsPromise = checkMapplsAccess();

  if (!db) {
    const mappls = await mapplsPromise;

    return NextResponse.json(
      {
        ok: false,
        database: "not_configured",
        databaseType: "PostgreSQL",
        mapplsConfigured: mappls.ok,
        mapplsError: mappls.ok ? undefined : mappls.error,
        message:
          "Neon PostgreSQL is not configured. Check DATABASE_URL_POOLED and DATABASE_URL in .env.local.",
      },
      { status: 503 },
    );
  }

  try {
    await checkDatabaseConnection();

    const [databaseName, mappls] = await Promise.all([
      getDatabaseName(),
      mapplsPromise,
    ]);

    return NextResponse.json({
      ok: true,
      database: "connected",
      databaseType: "PostgreSQL",
      databaseName,
      mapplsConfigured: mappls.ok,
      mapplsError: mappls.ok ? undefined : mappls.error,
    });
  } catch (error) {
    const mappls = await mapplsPromise;

    console.error(
      "Database health check failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        databaseType: "PostgreSQL",
        mapplsConfigured: mappls.ok,
        mapplsError: mappls.ok ? undefined : mappls.error,
        message:
          "The configured Neon database could not be reached. Replace DATABASE_URL_POOLED and DATABASE_URL in .env.local with the current connection strings from the Neon dashboard.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown database connection error.",
      },
      { status: 503 },
    );
  }
}
