import MapPageClient from "./MapPageClient";

export default function MapPage() {
  return (
    <main className="main">
      <section className="hero">
        <div>
          <div className="eyebrow">Map</div>
          <h1>Mapped locations</h1>
          <p>Only records for which the geocoder returned coordinates are placed on the map.</p>
        </div>
      </section>
      <MapPageClient />
    </main>
  );
}
