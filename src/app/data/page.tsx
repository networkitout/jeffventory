import { requirePageSession } from "@/lib/auth-session";
import Icon from "@/components/Icon";

export const metadata = { title: "Your data · Jeffventory" };

export default async function DataPage() {
  await requirePageSession();
  return (
    <div>
      <header className="page-header"><div><h1>Your inventory. Your data.</h1><p>Keep a copy, take it elsewhere, or keep everything on your own machine.</p></div></header>
      <section className="data-section">
        <h2>Export inventory</h2>
        <p>CSV is ready for a spreadsheet. JSON includes the full inventory metadata and photo references. To export a specific view or selection, use Export CSV in the inventory.</p>
        <div className="actions">
          <a href="/api/export?format=csv" className="button button-primary"><Icon name="download" />Export CSV</a>
          <a href="/api/export?format=json" className="button"><Icon name="download" />Export JSON</a>
        </div>
        <p>Exports include private notes and serial numbers. Store them somewhere you trust. Image files are not embedded in either export.</p>
      </section>
      <section className="data-section">
        <h2>Back up the complete workspace</h2>
        <p>Stop Jeffventory first so the database and photos are consistent. Copy <code>prisma/dev.db</code> and the whole <code>data/uploads/</code> directory together to a safe location.</p>
        <p>If SQLite <code>-wal</code> or <code>-shm</code> sidecar files remain, include them with the database. If you changed <code>DATABASE_URL</code> or <code>UPLOAD_DIR</code>, use those locations instead. Restore the database, sidecars, and photos together while the app is stopped.</p>
        <p>With Docker Compose, the database and photos live together in the inventory volume under <code>/data</code>. Follow <code>docs/DEPLOYMENT.md</code> for a stopped-volume backup and restore. Do not remove the volume when updating.</p>
      </section>
      <section className="data-section">
        <h2>What leaves this computer?</h2>
        <p>Inventory, photos, and camera frames stay local. Only an explicit product lookup sends a barcode to UPCitemdb. Product suggestions are not saved until you apply them and save the item.</p>
        <p>Links to sold-price searches and listing creation open eBay in a new tab. Jeffventory does not connect to your eBay account or publish listings automatically.</p>
      </section>
      <section className="data-section">
        <h2>Using a phone or another computer</h2>
        <p>The server binds to this computer&apos;s loopback address by default. For trusted home-network devices, the Docker setup supports private HTTPS with a locally trusted certificate. Live camera scanning needs that secure connection.</p>
        <p>Sign-in is required. Every enabled account shares the same inventory and can view, edit, export, or delete it. The owner manages accounts in Account &amp; access. Keep it on your private network; use a stable hostname and trusted HTTPS for phones and passkeys.</p>
      </section>
    </div>
  );
}
