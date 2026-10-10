import type { LocationRecord } from "@/types";

declare global {
  var locationConnectLocalRecords: LocationRecord[] | undefined;
}

export function getLocalRecords() {
  return global.locationConnectLocalRecords ?? [];
}

export function replaceLocalRecords(records: LocationRecord[]) {
  global.locationConnectLocalRecords = records;
}

export function addLocalRecord(
  record: Omit<LocationRecord, "id" | "created_at" | "updated_at">
) {
  const now = new Date().toISOString();
  const records = getLocalRecords();
  const stored: LocationRecord = {
    ...record,
    id: records.length ? Math.max(...records.map(item => item.id)) + 1 : 1,
    created_at: now,
    updated_at: now
  };
  global.locationConnectLocalRecords = [...records, stored];
  return stored;
}
