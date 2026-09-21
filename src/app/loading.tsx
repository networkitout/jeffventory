export default function Loading() {
  return (
    <div role="status" aria-label="Loading inventory" className="space-y-6">
      <div className="loading-block" style={{ width: "40%", height: 32 }} />
      <div className="loading-block" style={{ width: "70%" }} />
      <div className="loading-block" style={{ height: 200 }} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
