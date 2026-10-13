import MapPageClient from "./MapPageClient";

export default function MapPage() {
  return (
    <div className="workspace-page">
      {/* <section className="page-heading">
        <div>
          <div className="eyebrow">LOCATION INTELLIGENCE</div>

          <h1>Map explorer</h1>

          <p>
            Search mapped addresses across West Bengal and inspect individual
            location records.
          </p>
        </div>
      </section> */}

      <MapPageClient />
    </div>
  );
}
