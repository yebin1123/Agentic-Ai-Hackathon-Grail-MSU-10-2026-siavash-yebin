export function LoadingState() {
  return (
    <section className="status-card status-card--loading" role="status" aria-live="polite">
      <span className="loading-ripple" aria-hidden="true" />
      <p className="section-label">Exploring the data</p>
      <h2>Preparing your crypto research overview</h2>
      <p className="meta-copy">
        Waiting for the research service's deterministic overview. Price history loads independently once the overview arrives. No mock data is used.
      </p>
    </section>
  )
}
