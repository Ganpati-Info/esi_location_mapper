import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

import RecordsTable from "@/components/RecordsTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function RecordsPage() {
  return (
    <div className="workspace-page records-page">
      <section className="page-heading records-page-heading">
        <div className="records-heading-copy">
          <div className="eyebrow">
            <ClipboardList size={14} />
            LOCATION DATABASE
          </div>

          <h1>Location records</h1>

          <p>
            Search and inspect location records, compare source addresses with
            resolved fields, and identify entries that need verification.
          </p>
        </div>

        <div className="heading-actions records-heading-actions">
          <Link href="../map" className="button button-secondary">
            <MapPinned size={16} />
            Map explorer
          </Link>

          {/* <Link href="../review" className="button button-primary">
            <ShieldCheck size={16} />
            Review queue
            <ArrowRight size={15} />
          </Link> */}
        </div>
      </section>

      <section className="records-information" aria-label="Records information">
        <div className="records-information-icon">
          <ClipboardList size={19} />
        </div>

        <div>
          <strong>Source data and resolved fields</strong>
          <p>
            Original address information should remain unchanged. Treat
            estimated coordinates as unverified until they have been checked.
          </p>
        </div>
      </section>

      <RecordsTable />
    </div>
  );
}
