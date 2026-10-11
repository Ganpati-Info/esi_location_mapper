import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processQueueBatch } from "@/lib/job-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET;

  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedSecret = authorization.slice("Bearer ".length);

  const expected = Buffer.from(secret);
  const supplied = Buffer.from(suppliedSecret);

  if (expected.length !== supplied.length) {
    return false;
  }

  return timingSafeEqual(expected, supplied);
}

export async function POST(request: NextRequest) {
  if (!process.env.WORKER_SECRET) {
    console.error("WORKER_SECRET is not configured.");

    return NextResponse.json(
      { success: false, error: "Worker authentication is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  try {
    const result = await processQueueBatch(5);

    return NextResponse.json({
      success: true,
      message: "Queue batch processed.",
      ...result,
    });
  } catch (error) {
    console.error("Worker batch failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to process the queue batch.",
      },
      { status: 500 },
    );
  }
}
