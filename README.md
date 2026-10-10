# Location Connect Demo v2

This version does not use Bhuvan.

The selected address provider is Mappls because its documented India APIs provide both address analytics/standardization and geocoding. Mappls documents village, post office, sub-district, district, state and PIN extraction, plus geocoding for addresses, postal codes, areas and POIs.

## Architecture

Browser
  -> Next.js API
  -> Excel/CSV parser
  -> Mappls Address Analytics
  -> optional Gemini enrichment
  -> Mappls Geocoding
  -> Neon PostgreSQL
  -> Records / Map

## No fake data

There are no hardcoded addresses, coordinates, districts, blocks, villages or demo records.

If Mappls credentials are missing, upload processing stops with a clear configuration error. It does not silently generate fake coordinates.

## Why Mappls

For this India-focused demo, Mappls is the first provider to try because it exposes an address analytics endpoint specifically for cleansing, parsing and standardization and its geocoder supports India address levels. It also documents rural/urban bias and administrative filters.

Mappls docs:
https://developer.mappls.com/documentation/sdk/rest-apis/mappls-address-analytics-api/readme/
https://developer.mappls.com/documentation/sdk/rest-apis/mappls-maps-geocoding-rest-api-example/Readme/

## Block field

The database has `block_name`.

Important: the code does not silently treat `subDistrict` as `block`. They are separate administrative concepts in India. If the input or provider explicitly gives a block, it is stored as block. For authoritative block/village hierarchy, LGD should be integrated as a later validation/enrichment source.

## Setup

### 1. Neon PostgreSQL

Create or open the project in the Neon console and copy its current pooled
connection string. An old or deleted Neon project produces
`getaddrinfo ENOTFOUND`.

### 2. Install

```bash
npm install
```

### 3. Environment

Copy `.env.example` to `.env.local`, then replace the placeholders with the
current values from Neon:

```env
DATABASE_URL_POOLED=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL=postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/neondb?sslmode=require&channel_binding=require
MAPPLS_ACCESS_TOKEN=YOUR_MAPPLS_TOKEN
```

Optional:

```env
GEMINI_API_KEY=YOUR_GEMINI_KEY
```

Gemini is not required for the core Mappls normalization/geocoding flow.

### 4. Start

```bash
npm run dev
```

Open:

http://localhost:3000

## Demo flow

1. Dashboard
2. Upload Excel/CSV
3. Server detects columns
4. Mappls normalizes address
5. Optional Gemini enrichment checks missing fields
6. Mappls geocodes the standardized address
7. One row is stored in `location_records`
8. Records page shows all columns
9. Map page shows mapped records
10. CSV export downloads the database contents

## Excel

Headerless spreadsheets are supported.

The demo assumes:
- column 1 = address
- column 2 = phone

When headers exist, the server tries to detect address, phone and recipient-name columns.

## Important production note

This demo processes rows synchronously. It is deliberately simple for the first working demonstration.

Before using millions of rows, replace the synchronous upload route with a queue/batch architecture and add:
- deduplication
- address cache
- retry policy
- provider rate-limit handling
- viewport-based map queries
- spatial indexes
- LGD hierarchy enrichment
- review workflow
- audit logging
