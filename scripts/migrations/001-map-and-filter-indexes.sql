-- =========================================================
-- LOCATION CONNECT
-- Migration: Map, district and filter indexes
-- Database: PostgreSQL / Neon
--
-- Important:
-- Run each CREATE INDEX CONCURRENTLY statement separately.
-- Do not put these statements inside BEGIN / COMMIT.
-- =========================================================


-- ---------------------------------------------------------
-- 1. District-specific mapped locations
--
-- Supports the map API's district, state and coordinate
-- filtering. Rows without coordinates are excluded.
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_coordinates
ON location_records (
    district,
    latitude,
    longitude
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;


-- ---------------------------------------------------------
-- 2. District records ordered by newest ID
--
-- Supports district-specific records pages.
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_id
ON location_records (
    district,
    id DESC
);


-- ---------------------------------------------------------
-- 3. District + record status
--
-- Supports filtered lists such as processed, review,
-- unresolved and other statuses.
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_status_id
ON location_records (
    district,
    status,
    id DESC
);


-- ---------------------------------------------------------
-- 4. Block dropdown options
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_block
ON location_records (
    district,
    (BTRIM(block_name))
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND block_name IS NOT NULL
    AND BTRIM(block_name) <> '';


-- ---------------------------------------------------------
-- 5. Tehsil / Taluka dropdown options
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_tehsil
ON location_records (
    district,
    (BTRIM(tehsil_taluka))
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND tehsil_taluka IS NOT NULL
    AND BTRIM(tehsil_taluka) <> '';


-- ---------------------------------------------------------
-- 6. Branch office dropdown options
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_branch_office
ON location_records (
    district,
    (BTRIM(branch_office))
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND branch_office IS NOT NULL
    AND BTRIM(branch_office) <> '';


-- ---------------------------------------------------------
-- 7. Post office dropdown options
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_post_office
ON location_records (
    district,
    (BTRIM(post_office_name))
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND post_office_name IS NOT NULL
    AND BTRIM(post_office_name) <> '';


-- ---------------------------------------------------------
-- 8. RO / SRO dropdown options
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_records_district_ro_sro
ON location_records (
    district,
    (BTRIM(ro_sro))
)
WHERE
    LOWER(BTRIM(state)) = 'west bengal'
    AND ro_sro IS NOT NULL
    AND BTRIM(ro_sro) <> '';


-- ---------------------------------------------------------
-- 9. Review queue
--
-- Supports listing pending, approved, rejected and
-- resolved review records by newest first.
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_review_status_created
ON location_review_records (
    review_status,
    created_at DESC,
    id DESC
);


-- ---------------------------------------------------------
-- 10. District-specific review queue
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_review_district_status_created
ON location_review_records (
    candidate_district,
    review_status,
    created_at DESC,
    id DESC
);


-- ---------------------------------------------------------
-- 11. Upload job queue
--
-- Supports finding work belonging to a particular job
-- and inspecting its processing state.
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_queue_job_status_id
ON upload_job_rows (
    upload_job_id,
    processing_status,
    id
);


-- ---------------------------------------------------------
-- 12. Recent upload jobs
-- ---------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS
    idx_lc_upload_jobs_created
ON upload_jobs (
    created_at DESC,
    id DESC
);