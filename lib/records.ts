import { getSampleRecords } from "@/lib/sample-data";
import { getLocalRecords } from "@/lib/local-store";
import type { LocationRecord } from "@/types";

function recordKey(record: LocationRecord) {
  return `${record.source_file_name ?? ""}:${record.source_row_number ?? ""}`;
}

export async function getAvailableRecords(): Promise<LocationRecord[]> {
  const samples = await getSampleRecords();
  const local = getLocalRecords();
  const processedBySource = new Map(local.map(record => [recordKey(record), record]));
  const sampleKeys = new Set(samples.map(recordKey));
  const merged = samples.map(record => processedBySource.get(recordKey(record)) ?? record);

  for (const record of local) {
    if (!sampleKeys.has(recordKey(record))) merged.push(record);
  }

  return merged;
}
