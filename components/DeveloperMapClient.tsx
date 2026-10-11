"use client";

import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const STATE_BOUNDS = {
  west: 85.4,
  south: 21.3,
  east: 89.9,
  north: 27.5,
};

const INITIAL_CENTER: [number, number] = [23.5, 87.8];

const DISTRICTS = [
  "Alipurduar",
  "Bankura",
  "Birbhum",
  "Cooch Behar",
  "Dakshin Dinajpur",
  "Darjeeling",
  "Hooghly",
  "Howrah",
  "Jalpaiguri",
  "Jhargram",
  "Kalimpong",
  "Kolkata",
  "Malda",
  "Murshidabad",
  "Nadia",
  "North 24 Parganas",
  "Paschim Bardhaman",
  "Paschim Medinipur",
  "Purba Bardhaman",
  "Purba Medinipur",
  "Purulia",
  "South 24 Parganas",
  "Uttar Dinajpur",
];

type MapPoint = {
  id: string;
  latitude: number | string;
  longitude: number | string;
  district: string;
  state?: string | null;
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
  pin_code?: string | null;
  status?: string | null;
  geocode_provider?: string | null;
  confidence_score?: number | null;
  count?: number;
  estimated_count?: number;
  review_count?: number;
};

type MapPayload = {
  success: boolean;
  error?: string;
  points?: MapPoint[];
  mode?: "points" | "clusters";
  hasMore?: boolean;
  returned?: number;
  maxPoints?: number;
};

type FilterPayload = {
  success: boolean;
  error?: string;
  filters?: {
    districts?: string[];
    blocks?: string[];
    tehsils?: string[];
    villages?: string[];
    branchOffices?: string[];
    postOffices?: string[];
    roSros?: string[];
  };
};

type Viewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

type Filters = {
  district: string;
  block: string;
  tehsil: string;
  village: string;
  branchOffice: string;
  postOffice: string;
  roSro: string;
  status: string;
  quality: string;
};

const EMPTY_FILTERS: Filters = {
  district: "",
  block: "",
  tehsil: "",
  village: "",
  branchOffice: "",
  postOffice: "",
  roSro: "",
  status: "",
  quality: "",
};

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}

function isEstimated(point: MapPoint): boolean {
  const provider = String(point.geocode_provider ?? "").toLowerCase();

  return (
    provider.includes("estimate") ||
    provider.includes("gemini") ||
    provider.includes("approx")
  );
}

function pointLabel(point: MapPoint): string {
  if (point.count && point.count > 1) {
    return `${formatNumber(point.count)} locations`;
  }

  return (
    point.original_address ||
    point.full_address ||
    point.village_name ||
    point.landmark ||
    "Location record"
  );
}

function MapViewportListener({
  onChange,
}: {
  onChange: (viewport: Viewport) => void;
}) {
  const map = useMap();

  const publish = useCallback(() => {
    const bounds = map.getBounds();

    onChange({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
      zoom: map.getZoom(),
    });
  }, [map, onChange]);

  useMapEvents({
    moveend: publish,
    zoomend: publish,
  });

  useEffect(() => {
    const timer = window.setTimeout(publish, 150);
    return () => window.clearTimeout(timer);
  }, [publish]);

  return null;
}

function FitStateBounds() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [STATE_BOUNDS.south, STATE_BOUNDS.west],
        [STATE_BOUNDS.north, STATE_BOUNDS.east],
      ],
      { padding: [20, 20] },
    );
  }, [map]);

  return null;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="developer-map-filter">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DeveloperMapClient() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterOptions, setFilterOptions] = useState<
    NonNullable<FilterPayload["filters"]>
  >({});
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    ...STATE_BOUNDS,
    zoom: 6,
  });
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"points" | "clusters">("clusters");
  const [hasMore, setHasMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const setFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      // Reset dependent filters when a parent changes.
      if (key === "district") {
        next.block = "";
        next.tehsil = "";
        next.village = "";
        next.branchOffice = "";
        next.postOffice = "";
        next.roSro = "";
      } else if (key === "block") {
        next.tehsil = "";
        next.village = "";
        next.branchOffice = "";
        next.postOffice = "";
        next.roSro = "";
      } else if (key === "tehsil") {
        next.village = "";
      }

      return next;
    });

    setSelectedPoint(null);
  }, []);

  // The filter API is global when district is omitted.
  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      setFiltersLoading(true);

      const params = new URLSearchParams();
      if (filters.district) params.set("district", filters.district);
      if (filters.block) params.set("block", filters.block);
      if (filters.tehsil) params.set("tehsil", filters.tehsil);

      try {
        const response = await fetch(
          `/api/developer/filters?${params.toString()}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = (await response.json()) as FilterPayload;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load map filters.");
        }

        setFilterOptions(payload.filters ?? {});
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(
          cause instanceof Error ? cause.message : "Unable to load filters.",
        );
      } finally {
        if (!controller.signal.aborted) setFiltersLoading(false);
      }
    }

    void loadFilters();
    return () => controller.abort();
  }, [filters.district, filters.block, filters.tehsil, reloadToken]);

  // Fetch only the current viewport and active filters.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMapLoading(true);
      setError("");

      const params = new URLSearchParams({
        west: String(viewport.west),
        south: String(viewport.south),
        east: String(viewport.east),
        north: String(viewport.north),
        zoom: String(viewport.zoom),
      });

      if (search) params.set("search", search);
      if (filters.district) params.set("district", filters.district);
      if (filters.block) params.set("block", filters.block);
      if (filters.tehsil) params.set("tehsil", filters.tehsil);
      if (filters.village) params.set("village", filters.village);
      if (filters.branchOffice) {
        params.set("branchOffice", filters.branchOffice);
      }
      if (filters.postOffice) params.set("postOffice", filters.postOffice);
      if (filters.roSro) params.set("roSro", filters.roSro);
      if (filters.status) params.set("status", filters.status);
      if (filters.quality) params.set("quality", filters.quality);

      try {
        const response = await fetch(
          `/api/developer/map?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as MapPayload;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load map locations.");
        }

        setPoints(payload.points ?? []);
        setMode(payload.mode ?? "clusters");
        setHasMore(Boolean(payload.hasMore));
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setPoints([]);
        setError(
          cause instanceof Error ? cause.message : "Unable to load map data.",
        );
      } finally {
        if (!controller.signal.aborted) setMapLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [viewport, filters, search, reloadToken]);

  const blockOptions = filterOptions.blocks ?? [];
  const tehsilOptions = filterOptions.tehsils ?? [];
  const villageOptions = filterOptions.villages ?? [];
  const branchOptions = filterOptions.branchOffices ?? [];
  const postOptions = filterOptions.postOffices ?? [];
  const roSroOptions = filterOptions.roSros ?? [];

  const displayedPoints = useMemo(
    () =>
      points.filter((point) => {
        const lat = toNumber(point.latitude);
        const lng = toNumber(point.longitude);
        return (
          lat !== null &&
          lng !== null &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        );
      }),
    [points],
  );

  const representedRecords = displayedPoints.reduce(
  (total, point) => total + (point.count ?? 1),
  0,
);

  return (
    <section className="developer-map-workspace">
      <div className="developer-map-filter-panel">
        <div className="developer-map-filter-heading">
          <div>
            <strong>Location filters</strong>
            <span>Filters are applied on the server.</span>
          </div>

          <button
            type="button"
            className="developer-map-reset"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearchInput("");
              setSearch("");
              setSelectedPoint(null);
            }}
          >
            <RefreshCw size={14} />
            Reset all
          </button>
        </div>

        <div className="developer-map-filter-grid">
          <SelectField
            label="District"
            value={filters.district}
            options={
              filterOptions.districts?.length
                ? filterOptions.districts
                : DISTRICTS
            }
            onChange={(value) => setFilter("district", value)}
          />

          <SelectField
            label="Block"
            value={filters.block}
            options={blockOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("block", value)}
          />

          <SelectField
            label="Tehsil / taluka"
            value={filters.tehsil}
            options={tehsilOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("tehsil", value)}
          />

          <SelectField
            label="Village / locality"
            value={filters.village}
            options={villageOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("village", value)}
          />

          <SelectField
            label="Post office"
            value={filters.postOffice}
            options={postOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("postOffice", value)}
          />

          <SelectField
            label="Branch office"
            value={filters.branchOffice}
            options={branchOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("branchOffice", value)}
          />

          <SelectField
            label="RO / SRO"
            value={filters.roSro}
            options={roSroOptions}
            disabled={!filters.district || filtersLoading}
            onChange={(value) => setFilter("roSro", value)}
          />

          <label className="developer-map-filter">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="processed">Processed</option>
              <option value="review">Review</option>
              <option value="unresolved">Unresolved</option>
              <option value="rejected">Rejected</option>
              <option value="error">Error</option>
            </select>
          </label>

          <label className="developer-map-filter">
            <span>Coordinate quality</span>
            <select
              value={filters.quality}
              onChange={(event) => setFilter("quality", event.target.value)}
            >
              <option value="">All coordinates</option>
              <option value="estimated">Estimated</option>
              <option value="other">Non-estimated</option>
              <option value="missing">Missing coordinates</option>
            </select>
          </label>

          <label className="developer-map-search">
            <Search size={17} />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search address or PIN code..."
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>
      </div>

      {error && (
        <div className="developer-map-error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="developer-map-summary">
        <div>
          <MapPinned size={17} />
          <strong>{filters.district || "West Bengal"}</strong>
          <span>
            {formatNumber(displayedPoints.length)} markers ·{" "}
            {formatNumber(representedRecords)} records represented
          </span>
        </div>

        <div className="developer-map-legend">
          <span>
            <i className="map-legend-dot mapped" /> Locations
          </span>
          <span>
            <i className="map-legend-dot estimated" /> Estimated
          </span>
          <span>
            <i className="map-legend-dot cluster" /> Cluster
          </span>
        </div>
      </div>

      <div className="developer-map-layout">
        <div className="developer-map-canvas">
          {mapLoading && (
            <div className="developer-map-loading">
              <LoaderCircle size={18} className="records-spinner" />
              Updating map…
            </div>
          )}

          <MapContainer
            center={INITIAL_CENTER}
            zoom={6}
            minZoom={5}
            maxZoom={19}
            scrollWheelZoom
            className="developer-leaflet-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitStateBounds />
            <MapViewportListener onChange={setViewport} />

            {displayedPoints.map((point) => {
              const lat = toNumber(point.latitude);
              const lng = toNumber(point.longitude);

              if (lat === null || lng === null) return null;

              const estimated = isEstimated(point);
              const isCluster = Boolean(point.count && point.count > 1);

              return (
                <CircleMarker
                  key={`${point.id}-${point.district}`}
                  center={[lat, lng]}
                  radius={
                    isCluster
                      ? Math.min(17, 5 + Math.log2(point.count ?? 1) * 2)
                      : 6
                  }
                  pathOptions={{
                    color: isCluster
                      ? "#3476b8"
                      : estimated
                        ? "#d97732"
                        : "#23825e",
                    fillColor: isCluster
                      ? "#72a9e0"
                      : estimated
                        ? "#f4a261"
                        : "#42a879",
                    fillOpacity: 0.8,
                    weight: isCluster ? 2 : 1,
                  }}
                  eventHandlers={{
                    click: () => setSelectedPoint(point),
                  }}
                >
                  <Popup>
                    <div className="developer-map-popup">
                      <strong>{pointLabel(point)}</strong>
                      <span>{point.district}, West Bengal</span>
                      {isCluster && (
                        <span>{formatNumber(point.count)} grouped records</span>
                      )}
                      {estimated && <em>Estimated coordinates — unverified</em>}
                      {!isCluster && (
                        <button
                          type="button"
                          onClick={() => setSelectedPoint(point)}
                        >
                          View record details
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <aside className="developer-map-details">
          {selectedPoint ? (
            <>
              <div className="developer-map-details-heading">
                <div>
                  <span className="panel-kicker">LOCATION DETAILS</span>
                  <h3>{pointLabel(selectedPoint)}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPoint(null)}
                  aria-label="Close location details"
                >
                  <X size={17} />
                </button>
              </div>

              {selectedPoint.count && selectedPoint.count > 1 && (
                <div className="developer-map-detail-row">
                  <span>Cluster size</span>
                  <strong>{formatNumber(selectedPoint.count)}</strong>
                </div>
              )}

              {[
                ["District", selectedPoint.district],
                ["State", selectedPoint.state || "West Bengal"],
                ["Village / locality", selectedPoint.village_name],
                ["Block", selectedPoint.block_name],
                ["Tehsil / taluka", selectedPoint.tehsil_taluka],
                ["Police station", selectedPoint.police_station_name],
                ["Post office", selectedPoint.post_office_name],
                ["Branch office", selectedPoint.branch_office],
                ["RO / SRO", selectedPoint.ro_sro],
                ["PIN code", selectedPoint.pin_code],
                ["Status", selectedPoint.status],
                ["Latitude", String(selectedPoint.latitude)],
                ["Longitude", String(selectedPoint.longitude)],
                ["Geocoding source", selectedPoint.geocode_provider],
                [
                  "Confidence",
                  selectedPoint.confidence_score == null
                    ? null
                    : String(selectedPoint.confidence_score),
                ],
              ].map(([label, value]) => (
                <div className="developer-map-detail-row" key={label}>
                  <span>{label}</span>
                  <strong>{value || "—"}</strong>
                </div>
              ))}

              {isEstimated(selectedPoint) && (
                <div className="developer-map-estimate-warning">
                  <AlertTriangle size={15} />
                  These coordinates are estimated and have not been verified.
                </div>
              )}

              {selectedPoint.original_address && (
                <div className="developer-map-original-address">
                  <span className="panel-kicker">ORIGINAL ADDRESS</span>
                  <p>{selectedPoint.original_address}</p>
                </div>
              )}

              {toNumber(selectedPoint.latitude) !== null &&
                toNumber(selectedPoint.longitude) !== null && (
                  <a
                    className="button button-secondary developer-map-directions"
                    href={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${selectedPoint.latitude},${selectedPoint.longitude}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                )}
            </>
          ) : (
            <div className="developer-map-detail-empty">
              <span className="developer-map-detail-empty-icon">
                <MapPinned size={23} />
              </span>
              <strong>Select a map item</strong>
              <p>
                Click a marker to inspect its location details. Zoom in to see
                individual records.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="developer-map-footer">
        <span>
          {mode === "clusters"
            ? "Markers represent aggregated coordinate cells at this zoom."
            : "Individual location markers are shown at this zoom."}
        </span>

        {hasMore && (
          <span className="developer-map-limit-warning">
            The current viewport exceeds the display limit. Zoom in or narrow
            the filters to inspect more records.
          </span>
        )}
      </div>
    </section>
  );
}
