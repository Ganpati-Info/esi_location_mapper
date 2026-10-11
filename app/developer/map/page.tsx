
import Link from "next/link";
import {
  ArrowLeft,
  MapPinned,
  Database,
  ShieldCheck,
} from "lucide-react";

import DeveloperMapClient from "@/components/DeveloperMapClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DeveloperMapPage() {
  return (
    <div className="workspace-page developer-map-page">
      <section className="page-heading developer-map-heading">
        <div>
          <div className="eyebrow">
            <MapPinned size={15} />
            GLOBAL GEOSPATIAL EXPLORER
          </div>

          <h1>West Bengal map</h1>

          <p>
            Explore locations across all 23 districts. Filter from district
            and block down to individual localities and offices.
          </p>
        </div>

        <Link
          href="/developer"
          className="button button-secondary"
        >
          <ArrowLeft size={16} />
          Developer overview
        </Link>
      </section>

      <section className="developer-map-notice">
        <div className="developer-map-notice-icon">
          <ShieldCheck size={19} />
        </div>

        <div>
          <strong>Global view — all districts</strong>
          <p>
            This map is independent of the selected district in the
            district workspace. Estimated coordinates remain unverified
            and should not be treated as confirmed locations.
          </p>
        </div>
      </section>

      <section className="developer-map-capabilities">
        <div className="developer-map-capability">
          <span className="developer-map-capability-icon orange">
            <MapPinned size={17} />
          </span>
          <div>
            <strong>Statewide exploration</strong>
            <span>Browse locations across West Bengal</span>
          </div>
        </div>

        <div className="developer-map-capability">
          <span className="developer-map-capability-icon blue">
            <Database size={17} />
          </span>
          <div>
            <strong>Hierarchical filters</strong>
            <span>District, block, locality and office</span>
          </div>
        </div>
      </section>

      <DeveloperMapClient />
    </div>
  );
}
