import RecordsTable from "@/components/RecordsTable";

export default function RecordsPage() {
  return (
    <main className="main">
      <section className="hero">
        <div>
          <div className="eyebrow">Database</div>
          <h1>Location records</h1>
          <p>Raw and normalized values are stored in the same record.</p>
        </div>
      </section>
      <RecordsTable />
    </main>
  );
}
