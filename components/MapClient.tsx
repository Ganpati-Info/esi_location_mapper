"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  AlertCircle,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { resolveDistrict } from "@/lib/districts";

/* =========================================================
   TYPES
   ========================================================= */

type MapPoint = {
  id?: string;
  original_address?: string | null;
  full_address?: string | null;
  village_name?: string | null;
  landmark?: string | null;
  block_name?: string | null;
  tehsil_taluka?: string | null;
  police_station_name?: string | null;
  branch_office?: string | null;
  post_office_name?: string | null;
  ro_sro?: string | null;
  district: string;
  state?: string | null;
  latitude: number | string;
  longitude: number | string;
  status?: string | null;
  geocode_provider?: string | null;
  confidence_score?: number | string | null;
  count?: number | string;
  estimated_count?: number | string;
  review_count?: number | string;
};

type Viewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

type FilterOptions = {
  blocks: string[];
  tehsils: string[];
  branchOffices: string[];
  postOffices: string[];
  roSros: string[];
};

type ActiveFilters = {
  block: string;
  tehsil: string;
  branchOffice: string;
  postOffice: string;
  roSro: string;
};

type MapResponse = {
  success: boolean;
  error?: string;
  message?: string;
  points?: MapPoint[];
  mode?: "clusters" | "points";
  hasMore?: boolean;
  maxPoints?: number;
  returned?: number;
};

const EMPTY_FILTERS: FilterOptions = {
  blocks: [],
  tehsils: [],
  branchOffices: [],
  postOffices: [],
  roSros: [],
};

const INITIAL_ACTIVE_FILTERS: ActiveFilters = {
  block: "",
  tehsil: "",
  branchOffice: "",
  postOffice: "",
  roSro: "",
};

const INITIAL_VIEWPORT: Viewport = {
  west: 85.4,
  south: 21.3,
  east: 89.9,
  north: 27.5,
  zoom: 7,
};

const numberFormat = new Intl.NumberFormat("en-IN");

/* =========================================================
   MAP HELPERS
   ========================================================= */

function getPointCoordinates(point: MapPoint): [number, number] | null {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return [latitude, longitude];
}

function isEstimated(point: MapPoint): boolean {
  return Boolean(
    point.geocode_provider?.startsWith("gemini-estimate-unverified") ||
    Number(point.estimated_count ?? 0) > 0,
  );
}

function isCluster(point: MapPoint): boolean {
  return Number(point.count ?? 1) > 1;
}

/* =========================================================
   MAP VIEWPORT REPORTING
   ========================================================= */

function ViewportReporter({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (viewport: Viewport) => void;
}) {
  const map = useMap();

  const report = useCallback(() => {
    if (!enabled) return;

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();

    if (
      ![west, south, east, north].every(Number.isFinite) ||
      west >= east ||
      south >= north
    ) {
      return;
    }

    onChange({
      west: Math.max(-180, west),
      south: Math.max(-90, south),
      east: Math.min(180, east),
      north: Math.min(90, north),
      zoom: map.getZoom(),
    });
  }, [enabled, map, onChange]);

  useMapEvents({
    moveend: report,
    zoomend: report,
  });

  useEffect(() => {
    if (enabled) report();
  }, [enabled, report]);

  return null;
}

/* =========================================================
   FIT MAP TO FIRST RESULT SET
   ========================================================= */

function FitToPoints({
  points,
  enabled,
}: {
  points: MapPoint[];
  enabled: boolean;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!enabled || fitted.current || points.length === 0) return;

    const coordinates = points
      .map(getPointCoordinates)
      .filter(
        (coordinate): coordinate is [number, number] => coordinate !== null,
      );

    if (coordinates.length === 0) return;

    fitted.current = true;

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 12);
      return;
    }

    const latitudes = coordinates.map(([latitude]) => latitude);
    const longitudes = coordinates.map(([, longitude]) => longitude);

    map.fitBounds(
      [
        [Math.min(...latitudes), Math.min(...longitudes)],
        [Math.max(...latitudes), Math.max(...longitudes)],
      ],
      {
        padding: [35, 35],
        maxZoom: 11,
      },
    );
  }, [enabled, map, points]);

  return null;
}

/* =========================================================
   MAIN MAP COMPONENT
   ========================================================= */

export default function MapClient() {
  const searchParams = useSearchParams();
  const district = resolveDistrict(searchParams.get("district"));

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [mode, setMode] = useState<"clusters" | "points">("clusters");

  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [maxPoints, setMaxPoints] = useState<number | null>(null);

  const [filterOptions, setFilterOptions] =
    useState<FilterOptions>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<ActiveFilters>(INITIAL_ACTIVE_FILTERS);

  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [error, setError] = useState("");

  const [mapRetry, setMapRetry] = useState(0);
  const [filterRetry, setFilterRetry] = useState(0);

  const [mapKey, setMapKey] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  /* -------------------------------------------------------
     Viewport updates
     ------------------------------------------------------- */

  const requestViewport = useCallback((next: Viewport) => {
    setViewport((current) => {
      const unchanged =
        Math.abs(current.west - next.west) < 0.0001 &&
        Math.abs(current.south - next.south) < 0.0001 &&
        Math.abs(current.east - next.east) < 0.0001 &&
        Math.abs(current.north - next.north) < 0.0001 &&
        current.zoom === next.zoom;

      return unchanged ? current : next;
    });
  }, []);

  /* -------------------------------------------------------
     Reset district-specific state
     ------------------------------------------------------- */

  useEffect(() => {
    setPoints([]);
    setSelected(null);
    setViewport(INITIAL_VIEWPORT);
    setFilterOptions(EMPTY_FILTERS);
    setFilters(INITIAL_ACTIVE_FILTERS);
    setSearch("");
    setError("");
    setFilterError("");
    setHasMore(false);
    setMaxPoints(null);
    setDataLoaded(false);
    setMapKey((key) => key + 1);
  }, [district]);

  /* -------------------------------------------------------
     Load filter dropdown options
     ------------------------------------------------------- */

  useEffect(() => {
    if (!district) {
      setFilterOptions(EMPTY_FILTERS);
      setFilterLoading(false);
      return;
    }

    const selectedDistrict = district;
    const controller = new AbortController();

    async function loadFilterOptions() {
      setFilterLoading(true);
      setFilterError("");

      try {
        const response = await fetch(
          `/api/filters?district=${encodeURIComponent(selectedDistrict)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const body = await response.json();

        if (!response.ok || !body.success) {
          throw new Error(
            body.error || "Unable to load district filter options.",
          );
        }

        const available = body.filters ?? {};

        setFilterOptions({
          blocks: Array.isArray(available.blocks) ? available.blocks : [],
          tehsils: Array.isArray(available.tehsils) ? available.tehsils : [],
          branchOffices: Array.isArray(available.branchOffices)
            ? available.branchOffices
            : [],
          postOffices: Array.isArray(available.postOffices)
            ? available.postOffices
            : [],
          roSros: Array.isArray(available.roSros) ? available.roSros : [],
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        console.error("Failed to load filter options:", err);

        setFilterError(
          err instanceof Error ? err.message : "Unable to load filter options.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setFilterLoading(false);
        }
      }
    }

    void loadFilterOptions();

    return () => controller.abort();
  }, [district, filterRetry]);

  /* -------------------------------------------------------
     Fetch map data
     ------------------------------------------------------- */

  useEffect(() => {
    if (!district) {
      setPoints([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        district,
        west: String(viewport.west),
        south: String(viewport.south),
        east: String(viewport.east),
        north: String(viewport.north),
        zoom: String(viewport.zoom),
      });

      if (search.trim()) {
        params.set("search", search.trim());
      }

      for (const [key, value] of Object.entries(filters)) {
        if (value.trim()) {
          params.set(key, value);
        }
      }

      try {
        const response = await fetch(`/api/map?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const body = (await response.json()) as MapResponse;

        if (!response.ok || !body.success) {
          throw new Error(body.error || "Unable to load map data.");
        }

        setPoints(Array.isArray(body.points) ? body.points : []);
        setMode(body.mode === "points" ? "points" : "clusters");
        setHasMore(Boolean(body.hasMore));
        setMaxPoints(
          typeof body.maxPoints === "number" ? body.maxPoints : null,
        );
        setSelected(null);
        setDataLoaded(true);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        console.error("Failed to load map data:", err);

        setError(
          err instanceof Error ? err.message : "Unable to load map data.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [district, viewport, search, filters, mapRetry]);

  /* -------------------------------------------------------
     Filter helpers
     ------------------------------------------------------- */

  const setFilter = useCallback((key: keyof ActiveFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_ACTIVE_FILTERS);
    setSearch("");
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const hasActiveFilters = activeFilterCount > 0 || search.trim().length > 0;

  const renderSelect = (
    label: string,
    key: keyof ActiveFilters,
    options: string[],
  ) => (
    <label className="map-filter-control" key={key}>
      <span>{label}</span>
      <select
        value={filters[key]}
        onChange={(event) => setFilter(key, event.target.value)}
        disabled={!district || filterLoading}
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  /* -------------------------------------------------------
     No district selected
     ------------------------------------------------------- */

  if (!district) {
    return (
      <div className="workspace-page">
        <section className="panel">
          <h2>Select a district first</h2>
          <p>
            Return to the West Bengal district explorer and select a district to
            open its map.
          </p>
          <a href="/" className="button button-primary">
            Explore districts
          </a>
        </section>
      </div>
    );
  }

  const defaultLat = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ?? 23.5);
  const defaultLng = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ?? 87.5);

  /* -------------------------------------------------------
     Main UI
     ------------------------------------------------------- */

  return (
    <div className="workspace-page">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <MapPin size={14} />
            DISTRICT MAP
          </div>
          <h1>{district} map explorer</h1>
          <p>
            Showing locations belonging to {district}, West Bengal. Use the
            filters to narrow results by administrative area or office.
          </p>
        </div>

        <div className="map-page-status" aria-live="polite">
          {loading ? (
            <>
              <RefreshCw size={15} className="spin" />
              Updating map
            </>
          ) : (
            `${numberFormat.format(points.length)} ${
              mode === "clusters" ? "map clusters" : "visible locations"
            }`
          )}
        </div>
      </section>

      {error && (
        <div className="inline-alert inline-alert-error" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Unable to load map data</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setMapRetry((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      {filterError && (
        <div className="inline-alert inline-alert-error" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Unable to load filters</strong>
            <p>{filterError}</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setFilterRetry((value) => value + 1)}
            disabled={filterLoading}
          >
            <RefreshCw size={15} />
            Retry filters
          </button>
        </div>
      )}

      {hasMore && (
        <div className="inline-alert" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>Map result limit reached</strong>
            <p>
              The API returned the first{" "}
              {numberFormat.format(maxPoints ?? points.length)} results for this
              view. Zoom in or use the filters or search to inspect a smaller
              area. Not every matching record is currently displayed.
            </p>
          </div>
        </div>
      )}

      <section className="location-map-layout">
        <div className="panel location-map-panel">
          <div className="location-map-toolbar">
            <label className="location-map-search">
              <Search size={18} />
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search addresses within ${district}...`}
                aria-label="Search this district's map"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="map-clear-filters"
                >
                  <X size={14} />
                </button>
              )}
            </label>

            <span className="selected-district-chip">
              <MapPin size={14} />
              {district}
            </span>
          </div>

          <div className="map-filter-heading">
            <div>
              <Filter size={16} />
              <strong>Filter plotted locations</strong>
              {filterLoading && <RefreshCw size={14} className="spin" />}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="map-clear-filters"
                onClick={clearFilters}
              >
                <X size={14} />
                Clear filters
              </button>
            )}
          </div>

          <div className="map-filter-grid">
            {renderSelect("Block", "block", filterOptions.blocks)}
            {renderSelect("Tehsil / Taluka", "tehsil", filterOptions.tehsils)}
            {renderSelect(
              "Branch office",
              "branchOffice",
              filterOptions.branchOffices,
            )}
            {renderSelect(
              "Post office",
              "postOffice",
              filterOptions.postOffices,
            )}
            {renderSelect("RO / SRO", "roSro", filterOptions.roSros)}
          </div>

          <div className="location-map-canvas">
            <MapContainer
              key={`${district}-${mapKey}`}
              center={[
                Number.isFinite(defaultLat) ? defaultLat : 23.5,
                Number.isFinite(defaultLng) ? defaultLng : 87.5,
              ]}
              zoom={7}
              scrollWheelZoom
              className="leaflet-map"
            >
              <TileLayer
                url={
                  process.env.NEXT_PUBLIC_TILE_URL ??
                  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                }
                attribution={
                  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ??
                  "&copy; OpenStreetMap contributors"
                }
              />

              <FitToPoints points={points} enabled={dataLoaded} />

              <ViewportReporter
                enabled={dataLoaded}
                onChange={requestViewport}
              />

              {points.map((point, index) => {
                const coordinates = getPointCoordinates(point);
                if (!coordinates) return null;

                const count = Math.max(1, Number(point.count ?? 1));
                const estimatedCount = Number(point.estimated_count ?? 0);
                const estimated = isEstimated(point);
                const cluster = isCluster(point);

                const color = cluster
                  ? "#64748b"
                  : estimated || point.status === "review"
                    ? "#e76f32"
                    : "#32936f";

                const key =
                  point.id ?? `${point.latitude}-${point.longitude}-${index}`;

                return (
                  <CircleMarker
                    key={key}
                    center={coordinates}
                    radius={
                      cluster ? Math.min(25, 7 + Math.log2(count) * 2.7) : 6
                    }
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.78,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => setSelected(point),
                    }}
                  >
                    <Popup>
                      <strong>
                        {cluster
                          ? `${numberFormat.format(count)} locations`
                          : point.village_name ||
                            point.original_address ||
                            point.district}
                      </strong>
                      <br />
                      {point.original_address ||
                        point.full_address ||
                        point.block_name ||
                        district}
                      <br />
                      {cluster ? (
                        <>
                          {numberFormat.format(estimatedCount)} estimated
                          coordinates in this cluster
                          {Number(point.review_count ?? 0) > 0 &&
                            ` · ${numberFormat.format(
                              Number(point.review_count),
                            )} review records`}
                        </>
                      ) : estimated ? (
                        <strong>
                          Estimated coordinates — verification required
                        </strong>
                      ) : (
                        `Status: ${point.status ?? "mapped"}`
                      )}
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>

            <div className="map-legend">
              <span>
                <i className="map-legend-dot map-legend-green" />
                Other mapped records
              </span>
              <span>
                <i className="map-legend-dot map-legend-orange" />
                Estimate / needs review
              </span>
              <span>
                <i
                  className="map-legend-dot"
                  style={{ background: "#64748b" }}
                />
                Cluster
              </span>
            </div>

            {!loading && dataLoaded && points.length === 0 && !error && (
              <div className="map-empty-overlay" role="status">
                <MapPin size={22} />
                <strong>No mapped locations found</strong>
                <p>
                  Try clearing the filters, changing your search, or zooming
                  out.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="panel location-detail-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">LOCATION DETAILS</span>
              <h2>Selected map item</h2>
            </div>
          </div>

          {!selected ? (
            <div className="map-detail-empty">
              <span className="map-detail-empty-icon">
                <MapPin size={23} />
              </span>
              <strong>Select a map marker</strong>
              <p>
                Click an individual marker to inspect its details. Cluster
                markers summarize multiple records.
              </p>
            </div>
          ) : (
            <div className="map-detail-content">
              <div className="map-detail-address">
                {selected.original_address ||
                  selected.full_address ||
                  selected.village_name ||
                  district}
              </div>

              {isEstimated(selected) && (
                <div className="coordinate-warning">
                  <AlertCircle size={17} />
                  <div>
                    <strong>Estimated coordinates</strong>
                    <p>
                      Verify this position before treating it as the exact
                      address. These coordinates are not confirmed.
                    </p>
                  </div>
                </div>
              )}

              {[
                ["District", selected.district],
                ["State", selected.state],
                ["Village", selected.village_name],
                ["Landmark", selected.landmark],
                ["Block", selected.block_name],
                ["Tehsil / Taluka", selected.tehsil_taluka],
                ["Police station", selected.police_station_name],
                ["RO / SRO", selected.ro_sro],
                ["Branch office", selected.branch_office],
                ["Post office", selected.post_office_name],
                ["Latitude", selected.latitude],
                ["Longitude", selected.longitude],
                // ["Status", selected.status],
                // ["Provider", selected.geocode_provider],
                // [
                //   "Confidence",
                //   selected.confidence_score == null
                //     ? null
                //     : `${selected.confidence_score}%`,
                // ],
                // [
                //   "Records in cluster",
                //   isCluster(selected)
                //     ? numberFormat.format(Number(selected.count))
                //     : null,
                // ],
                // [
                //   "Estimated records in cluster",
                //   selected.estimated_count == null
                //     ? null
                //     : numberFormat.format(Number(selected.estimated_count)),
                // ],
              ].map(([label, value]) => (
                <div className="map-detail-row" key={String(label)}>
                  <span>{label}</span>
                  <strong>
                    {value == null || value === "" ? "—" : String(value)}
                  </strong>
                </div>
              ))}

              {getPointCoordinates(selected) && (
                <a
                  className="button button-secondary"
                  href={`https://www.google.com/maps?q=${encodeURIComponent(
                    `${selected.latitude},${selected.longitude}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={15} />
                  Open in Google Maps
                </a>
              )}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
