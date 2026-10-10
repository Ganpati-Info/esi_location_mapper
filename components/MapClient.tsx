"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { LocationRecord } from "@/types";

function Fit({ records }: { records: LocationRecord[] }) {
  const map = useMap();

  useEffect(() => {
    const points = records
      .filter(r => r.latitude !== null && r.longitude !== null)
      .map(r => [Number(r.latitude), Number(r.longitude)] as [number, number]);

    if (points.length === 1) map.setView(points[0], 12);
    if (points.length > 1) {
      const latitudes = points.map(p => p[0]);
      const longitudes = points.map(p => p[1]);
      map.fitBounds([
        [Math.min(...latitudes), Math.min(...longitudes)],
        [Math.max(...latitudes), Math.max(...longitudes)]
      ], { padding: [25, 25] });
    }
  }, [records, map]);

  return null;
}

export default function MapClient() {
  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LocationRecord | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "1000" });
      if (search) params.set("search", search);

      const response = await fetch(`/api/records?${params}`);
      const data = await response.json();
      setRecords(data.records ?? []);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const mapped = useMemo(
    () => records.filter(r => r.latitude !== null && r.longitude !== null),
    [records]
  );

  const lat = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ?? 22.9734);
  const lng = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ?? 78.6569);
  const zoom = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM ?? 5);

  return (
    <div className="map-layout">
      <div className="card map-card">
        <div style={{position:"absolute",zIndex:500,padding:12}}>
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search map records..." />
        </div>

        <MapContainer center={[lat,lng]} zoom={zoom} className="map-container">
          <TileLayer
            url={process.env.NEXT_PUBLIC_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
            attribution={process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ?? "&copy; OpenStreetMap contributors"}
          />
          <Fit records={mapped} />

          {mapped.map(record => (
            <CircleMarker
              key={record.id}
              center={[Number(record.latitude), Number(record.longitude)]}
              radius={8}
              eventHandlers={{click: () => setSelected(record)}}
              pathOptions={{color:"#2563eb",fillColor:"#2563eb",fillOpacity:.65}}
            >
              <Popup>
                <strong>{record.village_name ?? record.district ?? "Location"}</strong><br />
                {record.pin_code ?? ""}<br />
                {record.status}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <aside className="card detail">
        <h2>Record details</h2>
        {!selected ? <p>Select a mapped record.</p> : (
          <>
            {[
              ["ID", selected.id],
              ["Recipient", selected.recipient_name],
              ["Original address", selected.original_address],
              ["Full address", selected.full_address],
              ["Village", selected.village_name],
              ["Landmark", selected.landmark],
              ["Tehsil / Taluka", selected.tehsil_taluka],
              ["Block", selected.block_name],
              ["District", selected.district],
              ["State", selected.state],
              ["Post Office", selected.post_office_name],
              ["PIN", selected.pin_code],
              ["Phone", selected.phone_number],
              ["Latitude", selected.latitude],
              ["Longitude", selected.longitude],
              ["Normalization", selected.normalization_provider],
              ["Geocoder", selected.geocode_provider],
              ["Confidence", `${selected.confidence_score ?? 0}%`],
              ["Status", selected.status]
            ].map(([label,value]) => (
              <div className="detail-row" key={String(label)}>
                <div className="detail-label">{label}</div>
                <div className="detail-value">{value ?? "-"}</div>
              </div>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
