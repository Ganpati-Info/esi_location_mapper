import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

const workerSecret = process.env.WORKER_SECRET;

if (!workerSecret) {
  throw new Error("WORKER_SECRET is not configured.");
}

const maxIdleRounds = 300;
const idleDelayMs = 2000;

async function runWorker() {
  let idleRounds = 0;

  console.log("Location Connect worker started.");

  while (idleRounds < maxIdleRounds) {
    try {
      const response = await fetch(`${baseUrl}/api/jobs/worker`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
        },
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? `Worker returned HTTP ${response.status}.`,
        );
      }

      const claimed = Number(result.claimed ?? 0);
      const recovered = Number(result.recovered ?? 0);

      console.log({ claimed, recovered });

      if (claimed === 0 && recovered === 0) {
        idleRounds++;
        await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
      } else {
        idleRounds = 0;
      }
    } catch (error) {
      console.error("Worker request failed:", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log("Queue is idle. Worker stopped.");
}

runWorker().catch((error) => {
  console.error("Worker terminated:", error);
  process.exitCode = 1;
});
