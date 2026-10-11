export type RecordStatus = "processed" | "review" | "unresolved" | "error";

export interface LocationRecord {
  id: number;

  // Original source data
  original_address: string;
  recipient_name: string | null;
  phone_number: string | null;

  // Resolved address components
  full_address: string | null;
  village_name: string | null;
  landmark: string | null;
  tehsil_taluka: string | null;
  block_name: string | null;
  police_station_name: string | null;
  post_office_name: string | null;
  pin_code: string | null;
  district: string | null;
  state: string | null;

  // Original supplementary office information
  ro_sro: string | null;
  branch_office: string | null;

  // Coordinates
  latitude: number | null;
  longitude: number | null;

  // Processing metadata
  normalization_provider: string | null;
  geocode_provider: string | null;
  confidence_score: number | null;
  status: RecordStatus;
  error_message: string | null;

  // Source tracking
  source_row_number: number | null;
  source_file_name: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface NormalizedAddress {
  full_address: string | null;
  recipient_name: string | null;
  village_name: string | null;
  landmark: string | null;
  tehsil_taluka: string | null;
  block_name: string | null;
  police_station_name: string | null;
  district: string | null;
  state: string | null;
  post_office_name: string | null;
  pin_code: string | null;
  confidence_score: number;
  provider: string;
}

export interface SourceRow {
  rowNumber: number;
  originalAddress: string;
  recipientName?: string | null;
  phoneNumber?: string | null;
  roSro?: string | null;
  branchOffice?: string | null;
  sourceFileName: string;
}

export interface ProcessingResult {
  record: LocationRecord | null;
  status: RecordStatus;
  errorMessage?: string | null;
}
