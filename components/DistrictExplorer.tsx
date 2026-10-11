"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { districtHref } from "@/lib/districts";
/* =========================================================
   TYPES
   ========================================================= */

type District = {
  name: string;
  region: string;
  description: string;
};

type Position = [number, number];

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: Position[][] | Position[][][];
};

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: Geometry;
};

type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

/* =========================================================
   WEST BENGAL DISTRICTS
   ========================================================= */

const DISTRICTS: District[] = [
  {
    name: "Alipurduar",
    region: "North Bengal",
    description: "Forests, rivers and the Dooars.",
  },
  {
    name: "Bankura",
    region: "Rarh Bengal",
    description: "Red earth and terracotta heritage.",
  },
  {
    name: "Birbhum",
    region: "Rarh Bengal",
    description: "Culture, crafts and rolling landscapes.",
  },
  {
    name: "Cooch Behar",
    region: "North Bengal",
    description: "Historic palaces and heritage.",
  },
  {
    name: "Dakshin Dinajpur",
    region: "North Bengal",
    description: "Riverside communities and green fields.",
  },
  {
    name: "Darjeeling",
    region: "North Bengal",
    description: "Himalayan views and tea gardens.",
  },
  {
    name: "Hooghly",
    region: "South Bengal",
    description: "Riverside towns and historic settlements.",
  },
  {
    name: "Howrah",
    region: "South Bengal",
    description: "An important urban and industrial district.",
  },
  {
    name: "Jalpaiguri",
    region: "North Bengal",
    description: "Tea estates and forest landscapes.",
  },
  {
    name: "Jhargram",
    region: "Western Bengal",
    description: "Woodlands and tribal heritage.",
  },
  {
    name: "Kalimpong",
    region: "North Bengal",
    description: "Mountain scenery and hillside towns.",
  },
  {
    name: "Kolkata",
    region: "South Bengal",
    description: "The cultural heart of West Bengal.",
  },
  {
    name: "Malda",
    region: "North Bengal",
    description: "Historic ruins and mango country.",
  },
  {
    name: "Murshidabad",
    region: "Central Bengal",
    description: "Historic Bengal and the Bhagirathi.",
  },
  {
    name: "Nadia",
    region: "South Bengal",
    description: "Heritage, learning and river landscapes.",
  },
  {
    name: "North 24 Parganas",
    region: "South Bengal",
    description: "Urban centres and diverse communities.",
  },
  {
    name: "Paschim Bardhaman",
    region: "Western Bengal",
    description: "Industrial centres and urban growth.",
  },
  {
    name: "Paschim Medinipur",
    region: "Western Bengal",
    description: "Forests, farmland and local heritage.",
  },
  {
    name: "Purba Bardhaman",
    region: "South Bengal",
    description: "Agricultural landscapes and settlements.",
  },
  {
    name: "Purba Medinipur",
    region: "South Bengal",
    description: "Coastal communities and river deltas.",
  },
  {
    name: "Purulia",
    region: "Western Bengal",
    description: "Distinctive hills and red-earth landscapes.",
  },
  {
    name: "South 24 Parganas",
    region: "South Bengal",
    description: "River channels and the Sundarbans region.",
  },
  {
    name: "Uttar Dinajpur",
    region: "North Bengal",
    description: "Agricultural landscapes and river plains.",
  },
];

/* =========================================================
   GEOGRAPHIC DATA
   ========================================================= */

const GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/states/west-bengal.geojson";

const ALIASES: Record<string, string[]> = {
  "cooch behar": ["koch bihar", "koch behar", "coochbehar"],
  "dakshin dinajpur": ["south dinajpur"],
  "uttar dinajpur": ["north dinajpur"],
  "paschim medinipur": ["west medinipur"],
  "purba medinipur": ["east medinipur"],
  "paschim bardhaman": ["west bardhaman", "paschim burdwan"],
  "purba bardhaman": ["east bardhaman", "purba burdwan"],
  "north 24 parganas": ["north twenty four parganas"],
  "south 24 parganas": ["south twenty four parganas"],
};

const CARD_COLORS = [
  "#D97736",
  "#397C72",
  "#6574CD",
  "#B76B83",
  "#5885A6",
  "#9671BA",
  "#BA8053",
];

/* =========================================================
   GEOGRAPHIC UTILITIES
   ========================================================= */

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function getFeatureName(feature: GeoFeature): string {
  const keys = [
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

  for (const key of keys) {
    const value = feature.properties[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function matchesDistrict(
  featureName: string,
  districtName: string,
) {
  const actual = normalize(featureName);
  const expected = normalize(districtName);

  if (actual === expected) {
    return true;
  }

  const aliases = ALIASES[districtName.toLowerCase()] ?? [];

  return aliases.some((alias) => normalize(alias) === actual);
}

function getRings(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates as Position[][];
  }

  return (geometry.coordinates as Position[][][]).flat();
}

function geometryToPath(geometry: Geometry): string {
  const rings = getRings(geometry);
  const points = rings.flat();

  if (points.length === 0) {
    return "";
  }

  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);

  const minX = Math.min(...longitudes);
  const maxX = Math.max(...longitudes);
  const minY = Math.min(...latitudes);
  const maxY = Math.max(...latitudes);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  const viewWidth = 200;
  const viewHeight = 160;
  const padding = 9;

  const scale = Math.min(
    (viewWidth - padding * 2) / width,
    (viewHeight - padding * 2) / height,
  );

  const renderedWidth = width * scale;
  const renderedHeight = height * scale;

  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  return rings
    .map((ring) => {
      const commands = ring.map(([longitude, latitude], index) => {
        const x = offsetX + (longitude - minX) * scale;

        const y =
          viewHeight -
          offsetY -
          (latitude - minY) * scale;

        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      });

      return `${commands.join(" ")} Z`;
    })
    .join(" ");
}

/* =========================================================
   DISTRICT CARD MAP
   ========================================================= */

function FallbackShape() {
  return (
    <svg
      viewBox="0 0 200 160"
      className="district-map-svg"
      aria-hidden="true"
    >
      <path
        d="M87 13 L117 23 L137 18 L153 43 L174 48 L164 70 L179 89 L158 105 L151 128 L127 145 L104 137 L88 150 L68 130 L48 125 L39 104 L22 89 L35 66 L30 45 L54 35 L68 17 Z"
        className="district-map-shape district-map-fallback"
      />
    </svg>
  );
}

function DistrictMap({
  feature,
  color,
}: {
  feature?: GeoFeature;
  color: string;
}) {
  if (!feature) {
    return <FallbackShape />;
  }

  const path = geometryToPath(feature.geometry);

  if (!path) {
    return <FallbackShape />;
  }

  const patternId = `map-grid-${normalize(getFeatureName(feature))}`;

  return (
    <svg
      viewBox="0 0 200 160"
      className="district-map-svg"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 10 0 L 0 0 0 10"
            fill="none"
            stroke={color}
            strokeOpacity="0.12"
            strokeWidth="0.6"
          />
        </pattern>
      </defs>

      <path d={path} fill={`url(#${patternId})`} />

      <path
        d={path}
        className="district-map-shape"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================================
   WEST BENGAL HERO ARTWORK
   Uses the geographic polygons from the GeoJSON dataset.
   ========================================================= */

function WestBengalArtwork({
  features,
}: {
  features: GeoFeature[];
}) {
  const polygons = features.flatMap((feature) =>
    getRings(feature.geometry),
  );

  const allPoints = polygons.flat();

  if (allPoints.length === 0) {
    return (
      <div className="west-bengal-map-loading">
        Loading West Bengal map...
      </div>
    );
  }

  const longitudes = allPoints.map(([longitude]) => longitude);
  const latitudes = allPoints.map(([, latitude]) => latitude);

  const minX = Math.min(...longitudes);
  const maxX = Math.max(...longitudes);
  const minY = Math.min(...latitudes);
  const maxY = Math.max(...latitudes);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  const viewWidth = 260;
  const viewHeight = 340;
  const padding = 15;

  const scale = Math.min(
    (viewWidth - padding * 2) / width,
    (viewHeight - padding * 2) / height,
  );

  const renderedWidth = width * scale;
  const renderedHeight = height * scale;

  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  function project([longitude, latitude]: Position): Position {
    return [
      offsetX + (longitude - minX) * scale,
      viewHeight - offsetY - (latitude - minY) * scale,
    ];
  }

  function ringToPath(ring: Position[]) {
    const commands = ring.map((point, index) => {
      const [x, y] = project(point);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    return `${commands.join(" ")} Z`;
  }

  const districtPaths = features.flatMap((feature, featureIndex) =>
    getRings(feature.geometry).map((ring, ringIndex) => ({
      key: `${featureIndex}-${ringIndex}`,
      path: ringToPath(ring),
    })),
  );

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      className="west-bengal-artwork"
      role="img"
      aria-label="Geographic map of West Bengal showing district boundaries"
    >
      <defs>
        <linearGradient
          id="west-bengal-fill"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0%" stopColor="#F5A476" />
          <stop offset="100%" stopColor="#D96532" />
        </linearGradient>

        <filter
          id="west-bengal-shadow"
          x="-30%"
          y="-20%"
          width="160%"
          height="150%"
        >
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="5"
            floodColor="#000000"
            floodOpacity="0.16"
          />
        </filter>
      </defs>

      <g filter="url(#west-bengal-shadow)">
        {districtPaths.map(({ key, path }) => (
          <path
            key={key}
            d={path}
            fill="url(#west-bengal-fill)"
            fillOpacity="0.94"
            stroke="#FFE0C9"
            strokeWidth="0.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Decorative reference points, not verified coordinates. */}
      {[
        [0.47, 0.24],
        [0.54, 0.39],
        [0.45, 0.53],
        [0.57, 0.65],
        [0.43, 0.79],
      ].map(([x, y], index) => (
        <circle
          key={index}
          cx={x * viewWidth}
          cy={y * viewHeight}
          r={index === 2 ? 3.5 : 2.3}
          fill="#FFF7EE"
          stroke="#D96532"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

/* =========================================================
   SEARCH BAR
   ========================================================= */

function SearchBox({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="district-search">
      <Search size={20} strokeWidth={1.8} />

      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search districts..."
        aria-label="Search West Bengal districts"
      />

      {value && (
        <button
          type="button"
          className="district-search-clear"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X size={17} />
        </button>
      )}

      <kbd className="district-search-shortcut">⌘ K</kbd>
    </div>
  );
}

/* =========================================================
   DISTRICT CARD
   ========================================================= */

function DistrictCard({
  district,
  index,
  feature,
}: {
  district: District;
  index: number;
  feature?: GeoFeature;
}) {
  const color = CARD_COLORS[index % CARD_COLORS.length];

  const cardStyle = {
    "--district-accent": color,
    "--card-index": index,
  } as React.CSSProperties;

  // Selecting a district opens its dashboard.
  // The canonical district name is preserved in the URL.
  const dashboardUrl = districtHref("/dashboard", district.name);

  return (
    <Link
      href={dashboardUrl}
      className="district-card"
      style={cardStyle}
      aria-label={`Open ${district.name} district dashboard`}
    >
      <div className="district-card-top">
        <span className="district-card-number">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span className="district-card-region">{district.region}</span>
      </div>

      <div className="district-card-map">
        <div className="district-card-map-decoration decoration-one" />
        <div className="district-card-map-decoration decoration-two" />

        <DistrictMap feature={feature} color={color} />

        <span className="district-map-caption">WEST BENGAL</span>
      </div>

      <div className="district-card-content">
        <div className="district-card-title-row">
          <h3>{district.name}</h3>

          <span className="district-card-arrow">
            <ArrowUpRight size={19} />
          </span>
        </div>

        <p>{district.description}</p>

        <div className="district-card-footer">
          <span>
            <MapPin size={13} />
            District workspace
          </span>

          <span className="district-card-open">
            Open dashboard
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* =========================================================
   MAIN DISTRICT EXPLORER
   ========================================================= */

export default function DistrictExplorer() {
  const [search, setSearch] = useState("");
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);

  /* Load geographic boundaries once. */

  useEffect(() => {
    const controller = new AbortController();

    async function loadDistrictBoundaries() {
      try {
        const response = await fetch(GEOJSON_URL, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Could not load district boundaries: ${response.status}`,
          );
        }

        const data = (await response.json()) as GeoCollection;

        setFeatures(
          Array.isArray(data.features) ? data.features : [],
        );

        setMapError(false);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("District boundary loading failed:", error);
        setMapError(true);
      } finally {
        if (!controller.signal.aborted) {
          setMapLoading(false);
        }
      }
    }

    loadDistrictBoundaries();

    return () => {
      controller.abort();
    };
  }, []);

  /* Search districts by name or region. */

  const filteredDistricts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return DISTRICTS;
    }

    return DISTRICTS.filter(
      (district) =>
        district.name.toLowerCase().includes(query) ||
        district.region.toLowerCase().includes(query),
    );
  }, [search]);

  function findFeature(districtName: string) {
    return features.find((feature) =>
      matchesDistrict(getFeatureName(feature), districtName),
    );
  }

  /* =======================================================
     PAGE
     ======================================================= */

  return (
    <main className="district-page">
      {/* HERO */}

      <section className="district-hero">
        <div className="district-hero-grid" />

        <div className="district-hero-inner">
          <div className="district-hero-copy">
            <div className="district-eyebrow">
              <span className="district-eyebrow-dot" />
              LOCATION CONNECT
              <span className="district-eyebrow-divider">/</span>
              WEST BENGAL
            </div>

            <h1>
              Every district.
              <br />
              <span>One connected map.</span>
            </h1>

            <p className="district-hero-description">
              Explore West Bengal, district by district.
              Discover geographic coverage and access
              location information from one place.
            </p>

            <div className="district-hero-meta">
              <div className="district-meta-item">
                <span className="district-meta-number">23</span>
                <span>Districts</span>
              </div>

              <div className="district-meta-divider" />

              <div className="district-meta-item">
                <span className="district-meta-number">01</span>
                <span>Connected state</span>
              </div>
            </div>
          </div>

          {/* REAL GEOGRAPHIC ARTWORK */}

          <div className="district-hero-visual">
            <div className="district-visual-orbit orbit-one" />
            <div className="district-visual-orbit orbit-two" />

            <div className="district-visual-map district-visual-map-real">
              <WestBengalArtwork features={features} />
            </div>

            {/* <div className="district-visual-label label-top">
              <span />
              NORTH BENGAL
            </div>

            <div className="district-visual-label label-bottom">
              <span />
              SOUTH BENGAL
            </div>

            <div className="district-visual-note">
              <span className="district-note-dot" />

              <div>
                <strong>West Bengal</strong>
                <small>23 districts · One connected map</small>
              </div>
            </div> */}
          </div>
        </div>

        <div className="district-hero-bottom">
          <span>GEOGRAPHY · DISCOVERY · CONNECTIVITY</span>
          <ArrowDownRight size={17} />
        </div>
      </section>

      {/* DISTRICT DIRECTORY */}

      <section className="district-content">
        <div className="district-section-heading">
          <div>
            <div className="district-section-eyebrow">
              EXPLORE THE STATE
            </div>

            <h2>
              Find your <span>district.</span>
            </h2>

            <p>
              Select a district to explore its geographic
              coverage and location data.
            </p>
          </div>

          <div className="district-heading-count">
            <strong>
              {String(filteredDistricts.length).padStart(2, "0")}
            </strong>

            <span>OF {DISTRICTS.length} DISTRICTS</span>
          </div>
        </div>

        {/* SEARCH */}

        <div className="district-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            onClear={() => setSearch("")}
          />

          <div className="district-toolbar-note">
            <span className="district-status-dot" />

            {mapLoading
              ? "Loading geographic boundaries"
              : mapError
                ? "Map boundaries unavailable"
                : "District explorer"}
          </div>
        </div>

        {/* DISTRICT CARDS */}

        {filteredDistricts.length > 0 ? (
          <div className="district-grid">
            {filteredDistricts.map((district) => {
              const originalIndex = DISTRICTS.findIndex(
                (item) => item.name === district.name,
              );

              return (
                <DistrictCard
                  key={district.name}
                  district={district}
                  index={originalIndex}
                  feature={findFeature(district.name)}
                />
              );
            })}
          </div>
        ) : (
          <div className="district-empty">
            <div className="district-empty-icon">
              <Search size={25} />
            </div>

            <h3>No districts found</h3>

            <p>
              We couldn't find a district matching "{search}".
              Try a different name.
            </p>

            <button
              type="button"
              className="district-reset-button"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          </div>
        )}

        {/* BOTTOM BANNER */}

        <div className="district-bottom-banner">
          <div className="district-bottom-icon">
            <MapPin size={21} />
          </div>

          <div>
            <strong>
              One state. Twenty-three districts.
            </strong>

            <p>
              A unified starting point for exploring
              West Bengal's geographic coverage.
            </p>
          </div>

          <span className="district-bottom-mark">
            LC / WB
          </span>
        </div>

        {/* FOOTER */}

        <footer className="district-footer">
          <span>
            © {new Date().getFullYear()} Location Connect
          </span>

          <span>MADE FOR WEST BENGAL</span>
        </footer>
      </section>
    </main>
  );
}