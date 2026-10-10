export type RecordStatus = "processed" | "review" | "unresolved" | "error";

export interface LocationRecord {
  id: number;
  original_address: string;
  full_address: string | null;
  recipient_name: string | null;
  village_name: string | null;
  landmark: string | null;
  tehsil_taluka: string | null;
  block_name: string | null;
  district: string | null;
  state: string | null;
  post_office_name: string | null;
  pin_code: string | null;
  phone_number: string | null;
  latitude: number | null;
  longitude: number | null;
  normalization_provider: string | null;
  geocode_provider: string | null;
  confidence_score: number | null;
  status: RecordStatus;
  error_message: string | null;
  source_row_number: number | null;
  source_file_name: string | null;
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
  district: string | null;
  state: string | null;
  post_office_name: string | null;
  pin_code: string | null;
  confidence_score: number;
  provider: string;
}
