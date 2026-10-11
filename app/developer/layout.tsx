import type { ReactNode } from "react";
import DeveloperSidebar from "@/components/developer/DeveloperSidebar";

export default function DeveloperLayout({ children }: { children: ReactNode }) {
  return (
    <div className="developer-shell">
      <DeveloperSidebar />

      <div className="developer-content"><main className="developer-page-content">{children}</main>
      </div>
    </div>
  );
}
