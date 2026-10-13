"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
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
  cluster_radius_km?: number;
};

/* =========================================================
   DISTRICT BOUNDARY HIGHLIGHT
   ========================================================= */

type DistrictFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
};

type DistrictFeatureCollection = {
  type: "FeatureCollection";
  features: DistrictFeature[];
};

const DISTRICT_BOUNDARIES_URL =
  "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/states/west-bengal.geojson";

function normalizeDistrictName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function MapZoomTracker({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function getBoundaryDistrictName(feature: DistrictFeature): string {
  const properties = feature.properties;

  const possibleKeys = [
    "district",
    "DISTRICT",
    "District",
    "district_name",
    "DISTRICT_NAME",
    "name",
    "NAME",
    "name_2",
    "NAME_2",
    "dtname",
    "DTNAME",
  ];

  for (const key of possibleKeys) {
    const value = properties[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function DistrictBoundaryLayer({ district }: { district: string }) {
  const [boundaries, setBoundaries] =
    useState<DistrictFeatureCollection | null>(null);

  const [boundaryError, setBoundaryError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBoundaries() {
      try {
        const response = await fetch(DISTRICT_BOUNDARIES_URL, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load district boundaries.");
        }

        const data = (await response.json()) as DistrictFeatureCollection;

        if (!Array.isArray(data.features)) {
          throw new Error("Invalid district boundary data.");
        }

        setBoundaries(data);
        setBoundaryError(false);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error("District boundary loading failed:", error);
        setBoundaryError(true);
      }
    }

    void loadBoundaries();

    return () => controller.abort();
  }, []);

  const normalize = normalizeDistrictName;

  const aliases: Record<string, string[]> = {
    coochbehar: ["kochbihar", "kochbehar"],
    dakshindinajpur: ["southdinajpur"],
    uttardinajpur: ["northdinajpur"],
    paschimmedinipur: ["westmedinipur"],
    purbamedinipur: ["eastmedinipur"],
    paschimbardhaman: ["westbardhaman", "paschimburdwan"],
    purbabardhaman: ["eastbardhaman", "purbaburdwan"],
  };

  const selectedName = normalize(district);

  const selectedAliases = aliases[selectedName] ?? [];

  const matchesSelectedDistrict = (feature: DistrictFeature) => {
    const featureName = normalize(getBoundaryDistrictName(feature));

    return (
      featureName === selectedName || selectedAliases.includes(featureName)
    );
  };

  if (!boundaries) {
    return null;
  }

  if (boundaryError) {
    return null;
  }

  return (
    <>
      {/* Surrounding districts: subtle boundaries */}
      <GeoJSON
        key="west-bengal-district-background"
        data={boundaries as never}
        style={() => ({
          color: "#94A3B8",
          weight: 1.2,
          opacity: 0.9,
          fillColor: "#E2E8F0",
          fillOpacity: 0.12,
        })}
        interactive={false}
      />

      {/* Selected district: prominent highlight */}
      {boundaries.features
        .filter(matchesSelectedDistrict)
        .map((feature, index) => (
          <GeoJSON
            key={`${selectedName}-${index}`}
            data={feature as never}
            style={() => ({
              color: "#6D28D9",
              weight: 3,
              opacity: 1,
              fillColor: "#8B5CF6",
              fillOpacity: 0.24,
            })}
            interactive={false}
          />
        ))}
    </>
  );
}

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

// Manually placed hospitals.
// Later, these can be loaded from a database or API.

const MANUAL_HOSPITALS = [
  {
    id: "hospital-central-tarapur",
    name: "Central Hospital, Tarapur",
    address: "Tarapur, Dhuliyan, Murshidabad, West Bengal",
    latitude: 24.6734219,
    longitude: 87.9313289,
    type: "Hospital",
    district: "Murshidabad",
    color: "#7C3AED",
    source: "Google Maps",
  },
];

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
  return (
    String(point.id ?? "").startsWith("cluster:") ||
    Number(point.count ?? 1) > 1
  );
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
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

const hospitalIcon = L.divIcon({
  className: "hospital-map-icon-wrapper",

  html: `
    <div class="hospital-map-icon" title="Central Hospital, Tarapur">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path
          d="M16 2 L16 2
             C8.3 2 3 7.7 3 14.5
             C3 23 16 30 16 30
             C16 30 29 23 29 14.5
             C29 7.7 23.7 2 16 2Z"
          fill="#DC2626"
          stroke="#FFFFFF"
          stroke-width="2"
        />
        <rect x="13" y="7" width="6" height="15" rx="1" fill="#FFFFFF"/>
        <rect x="8.5" y="11.5" width="15" height="6" rx="1" fill="#FFFFFF"/>
      </svg>
    </div>
  `,

  iconSize: [38, 42],
  iconAnchor: [19, 40],
  popupAnchor: [0, -38],
});

function createLocationPinIcon(color: string, zoom: number) {
  const size = Math.max(18, Math.min(32, 18 + (zoom - 7) * 1.5));

  return L.divIcon({
    className: "location-pin-icon-wrapper",
    iconSize: [size, size * 1.3],
    iconAnchor: [size / 2, size * 1.3],
    popupAnchor: [0, -size],
    tooltipAnchor: [0, -size * 0.9],

    html: `
      <div class="location-pin-icon" style="--pin-color:${color};width:${size}px;height:${size * 1.3}px">
        <svg viewBox="0 0 32 42" width="100%" height="100%" aria-hidden="true">
          <path
            d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z"
            fill="${color}"
            stroke="#fff"
            stroke-width="2"
          />
          <circle cx="16" cy="15" r="5.5" fill="#fff"/>
        </svg>
      </div>
    `,
  });
}

type MapFocusTarget = {
  id: string;
  latitude: number;
  longitude: number;
} | null;

function MapFocusController({ target }: { target: MapFocusTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo(
      [target.latitude, target.longitude],
      Math.max(map.getZoom(), 15),
      {
        animate: true,
        duration: 0.8,
      },
    );
  }, [map, target]);
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
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [mapFocusTarget, setMapFocusTarget] = useState<MapFocusTarget>(null);
  const [clusterRecords, setClusterRecords] = useState<MapPoint[]>([]);
  const [clusterRecordsLoading, setClusterRecordsLoading] = useState(false);
  const [clusterRecordsError, setClusterRecordsError] = useState("");
  const [clusterPage, setClusterPage] = useState(1);
  const [clusterTotal, setClusterTotal] = useState(0);
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

  const [zoomLevel, setZoomLevel] = useState(7);

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
    setFocusedRecordId(null);
    setMapFocusTarget(null);
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
        // Keep an explicitly selected record selected while its zoomed-in
        // viewport reloads. Clear only cluster selections during map refresh.
        setSelected((current) =>
          current && !isCluster(current) ? current : null,
        );
        setClusterRecords([]);
        setClusterRecordsError("");
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

  useEffect(() => {
    if (!district || !selected || !isCluster(selected)) {
      setClusterRecords([]);
      setClusterTotal(0);
      setClusterRecordsLoading(false);
      return;
    }
    const selectedDistrict = district;
    const selectedCluster = selected;
    const controller = new AbortController();
    async function loadClusterRecords() {
      setClusterRecordsLoading(true);
      setClusterRecordsError("");
      try {
        const params = new URLSearchParams({
          district: selectedDistrict,
          latitude: String(selectedCluster.latitude),
          longitude: String(selectedCluster.longitude),
          radiusKm: "20",
          page: String(clusterPage),
          pageSize: "10",
        });
        for (const [key, value] of Object.entries(filters))
          if (value.trim()) params.set(key, value);
        if (search.trim()) params.set("search", search.trim());
        const response = await fetch(
          `/api/map/cluster-details?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok || !body.success)
          throw new Error(body.error || "Unable to load cluster records.");
        setClusterRecords(Array.isArray(body.records) ? body.records : []);
        setClusterTotal(Number(body.total ?? 0));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setClusterRecordsError(
          error instanceof Error
            ? error.message
            : "Unable to load cluster records.",
        );
      } finally {
        if (!controller.signal.aborted) setClusterRecordsLoading(false);
      }
    }
    void loadClusterRecords();
    return () => controller.abort();
  }, [selected, clusterPage, district, filters, search]);

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

              <MapZoomTracker onZoomChange={setZoomLevel} />
              <MapFocusController target={mapFocusTarget} />
              <DistrictBoundaryLayer district={district} />

              {district.trim().toLowerCase() === "murshidabad" && (
                <Marker
                  position={[24.6734219, 87.9313289]}
                  icon={hospitalIcon}
                  zIndexOffset={10000}
                  eventHandlers={{
                    click: () => {
                      setSelected(null);
                    },
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 210 }}>
                      <div
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "#FEE2E2",
                          color: "#B91C1C",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          marginBottom: 8,
                        }}
                      >
                        HOSPITAL
                      </div>

                      <h3
                        style={{
                          margin: "0 0 6px",
                          fontSize: 15,
                          fontWeight: 700,
                        }}
                      >
                        Central Hospital, Tarapur
                      </h3>

                      <p style={{ margin: "0 0 10px", fontSize: 13 }}>
                        Tarapur, Dhuliyan, Murshidabad, West Bengal
                      </p>

                      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                        <div>
                          <strong>Latitude:</strong> 24.6734219
                        </div>
                        <div>
                          <strong>Longitude:</strong> 87.9313289
                        </div>
                      </div>

                      <a
                        href="https://www.google.com/maps/place/Central+hospital+tarapur+Dhuliyan/@24.6793543,87.9335008,14.76z/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          color: "#B91C1C",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        Open in Google Maps ↗
                      </a>
                    </div>
                  </Popup>
                </Marker>
              )}

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

                const isFocusedRecord = Boolean(
                  point.id && point.id === focusedRecordId,
                );
                const color = isFocusedRecord
                  ? "#2563EB"
                  : cluster
                    ? "#64748b"
                    : estimated || point.status === "review"
                      ? "#e76f32"
                      : "#32936f";

                const key =
                  point.id ?? `${point.latitude}-${point.longitude}-${index}`;

                const title =
                  point.village_name ||
                  point.original_address ||
                  point.full_address ||
                  point.district;

                const address =
                  point.original_address ||
                  point.full_address ||
                  point.block_name ||
                  point.district;

                const tooltipText = cluster
                  ? `${numberFormat.format(count)} locations`
                  : `${title} — ${estimated ? "Estimated coordinates; verification required" : `Status: ${point.status ?? "mapped"}`}`;

                // Keep clusters distinct from individual location pins.
                if (cluster) {
                  return (
                    <CircleMarker
                      key={key}
                      center={coordinates}
                      radius={Math.max(
                        7,
                        Math.min(25, 7 + Math.log2(count) * 2.7),
                      )}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: 0.85,
                        weight: 2,
                      }}
                      eventHandlers={{
                        click: () => {
                          setSelected(point);
                          setClusterPage(1);
                          setClusterRecords([]);
                          setClusterRecordsError("");
                        },
                      }}
                    >
                      <Tooltip direction="top" sticky>
                        {tooltipText}
                      </Tooltip>

                      <Popup>
                        <strong>
                          {numberFormat.format(count)} locations · 20 km cluster
                        </strong>
                        <br />
                        {district.toLowerCase() === "murshidabad" &&
                          `Approx. ${distanceKm(coordinates[0], coordinates[1], 24.6734219, 87.9313289).toFixed(1)} km from Central Hospital, Tarapur`}
                        <br />
                        {address}
                        <br />
                        {numberFormat.format(estimatedCount)} estimated
                        coordinates
                        {Number(point.review_count ?? 0) > 0 &&
                          ` · ${numberFormat.format(Number(point.review_count))} review records`}
                      </Popup>
                    </CircleMarker>
                  );
                }

                return (
                  <Marker
                    key={key}
                    position={coordinates}
                    icon={createLocationPinIcon(color, zoomLevel)}
                    zIndexOffset={isFocusedRecord ? 20000 : 0}
                    eventHandlers={{
                      click: () => setSelected(point),
                    }}
                  >
                    <Tooltip direction="top" sticky>
                      <div style={{ minWidth: 150, maxWidth: 260 }}>
                        <strong>{title}</strong>
                        <br />
                        <span>{address}</span>
                        <br />
                        <strong>
                          {estimated
                            ? "Estimated coordinates — verification required"
                            : `Status: ${point.status ?? "mapped"}`}
                        </strong>
                      </div>
                    </Tooltip>

                    <Popup>
                      <strong>{title}</strong>
                      <br />
                      {address}
                      <br />
                      {estimated ? (
                        <strong>
                          Estimated coordinates — verification required
                        </strong>
                      ) : (
                        `Status: ${point.status ?? "mapped"}`
                      )}
                    </Popup>
                  </Marker>
                );
              })}

              {/* Manually placed hospital markers */}
              {/* {MANUAL_HOSPITALS.filter(
                (hospital) =>
                  hospital.district.toLowerCase() === district.toLowerCase(),
              ).map((hospital) => (
                <CircleMarker
                  key={hospital.id}
                  center={[hospital.latitude, hospital.longitude]}
                  radius={10}
                  pathOptions={{
                    color: "#581C87",
                    fillColor: hospital.color,
                    fillOpacity: 1,
                    weight: 3,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 210 }}>
                      <div
                        style={{
                          display: "inline-block",
                          background: "#F3E8FF",
                          color: "#6B21A8",
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        HOSPITAL
                      </div>

                      <h3
                        style={{
                          margin: "0 0 6px",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {hospital.name}
                      </h3>

                      <p style={{ margin: "0 0 8px", fontSize: 12 }}>
                        {hospital.address}
                      </p>

                      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                        <div>
                          <strong>Latitude:</strong> {hospital.latitude}
                        </div>

                        <div>
                          <strong>Longitude:</strong> {hospital.longitude}
                        </div>

                        <div>
                          <strong>Type:</strong> {hospital.type}
                        </div>
                      </div>

                      <a
                        href="https://www.google.com/maps/place/Central+hospital+tarapur+Dhuliyan/@24.6793543,87.9335008,14.76z/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          color: "#7C3AED",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        Open in Google Maps ↗
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))} */}
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

          {selected && isCluster(selected) ? (
            <div className="map-detail-content">
              <div className="map-detail-address">Cluster details</div>
              <div className="map-detail-row">
                <span>Records in cluster</span>
                <strong>
                  {numberFormat.format(Number(selected.count ?? 0))}
                </strong>
              </div>
              <div className="map-detail-row">
                <span>Radius rule</span>
                <strong>20 km from centre</strong>
              </div>
              <div className="map-detail-row">
                <span>Centre latitude</span>
                <strong>{Number(selected.latitude).toFixed(6)}</strong>
              </div>
              <div className="map-detail-row">
                <span>Centre longitude</span>
                <strong>{Number(selected.longitude).toFixed(6)}</strong>
              </div>
              {district.toLowerCase() === "murshidabad" && (
                <div className="map-detail-row">
                  <span>Distance to Central Hospital</span>
                  <strong>
                    {distanceKm(
                      Number(selected.latitude),
                      Number(selected.longitude),
                      24.6734219,
                      87.9313289,
                    ).toFixed(2)}{" "}
                    km
                  </strong>
                </div>
              )}
              <h3 style={{ marginTop: 18 }}>Records in this 20 km cluster</h3>
              <p style={{ fontSize: 12, color: "#64748B" }}>
                Zoom in to see individual address pins. Select any record below
                to zoom to its exact stored coordinates and highlight it in
                blue.
              </p>
              {clusterRecordsLoading && <p>Loading records…</p>}
              {clusterRecordsError && <p role="alert">{clusterRecordsError}</p>}
              {!clusterRecordsLoading &&
                clusterRecords.map((record) => {
                  const recordId = String(record.id ?? "");
                  const recordAddress =
                    record.original_address ||
                    record.full_address ||
                    record.village_name ||
                    "Address unavailable";
                  const recordCoordinates = getPointCoordinates(record);
                  const isFocused = Boolean(
                    recordId && recordId === focusedRecordId,
                  );
                  return (
                    <button
                      key={recordId || `${record.latitude}-${record.longitude}`}
                      type="button"
                      className="map-detail-row"
                      aria-pressed={isFocused}
                      onClick={() => {
                        if (!recordCoordinates) return;
                        setFocusedRecordId(recordId);
                        setSelected(record);
                        setMapFocusTarget({
                          id: recordId,
                          latitude: recordCoordinates[0],
                          longitude: recordCoordinates[1],
                        });
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        padding: "10px",
                        marginTop: 6,
                        borderRadius: 8,
                        border: isFocused
                          ? "2px solid #2563EB"
                          : "1px solid #E2E8F0",
                        background: isFocused ? "#EFF6FF" : "white",
                        color: "inherit",
                      }}
                    >
                      <strong>{recordAddress}</strong>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {record.block_name || record.district} ·{" "}
                        {record.status || "mapped"}
                      </div>
                      <div
                        style={{ fontSize: 11, marginTop: 3, color: "#64748B" }}
                      >
                        Imported IP_Address/address value · Record ID:{" "}
                        {recordId || "—"}
                      </div>
                      <div
                        style={{ fontSize: 11, marginTop: 3, color: "#2563EB" }}
                      >
                        {recordCoordinates
                          ? "Click to zoom to and highlight this location"
                          : "Coordinates unavailable"}
                      </div>
                      {record.geocode_provider?.startsWith(
                        "gemini-estimate-unverified",
                      ) && (
                        <div style={{ color: "#b45309", fontSize: 12 }}>
                          Estimated coordinates — verification required
                        </div>
                      )}
                    </button>
                  );
                })}
              {!clusterRecordsLoading &&
                clusterTotal === 0 &&
                !clusterRecordsError && (
                  <p>No records found within this 20 km radius.</p>
                )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={clusterPage <= 1 || clusterRecordsLoading}
                  onClick={() =>
                    setClusterPage((page) => Math.max(1, page - 1))
                  }
                >
                  Previous
                </button>
                <span style={{ fontSize: 12 }}>
                  Page {clusterPage} · {numberFormat.format(clusterTotal)}{" "}
                  records
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    clusterPage * 10 >= clusterTotal || clusterRecordsLoading
                  }
                  onClick={() => setClusterPage((page) => page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : !selected ? (
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
