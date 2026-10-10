CREATE TABLE IF NOT EXISTS location_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_address TEXT NOT NULL,
  full_address TEXT NULL,

  recipient_name VARCHAR(255) NULL,
  village_name VARCHAR(255) NULL,
  landmark VARCHAR(500) NULL,
  tehsil_taluka VARCHAR(255) NULL,
  block_name VARCHAR(255) NULL,
  district VARCHAR(255) NULL,
  state VARCHAR(255) NULL,
  post_office_name VARCHAR(255) NULL,
  pin_code VARCHAR(6) NULL,

  phone_number VARCHAR(30) NULL,

  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,

  normalization_provider VARCHAR(80) NULL,
  geocode_provider VARCHAR(80) NULL,
  confidence_score DECIMAL(5,2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,

  source_row_number INT NULL,
  source_file_name VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_status (status),
  INDEX idx_district (district),
  INDEX idx_block (block_name),
  INDEX idx_village (village_name),
  INDEX idx_pin (pin_code),
  INDEX idx_phone (phone_number),
  INDEX idx_coords (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
