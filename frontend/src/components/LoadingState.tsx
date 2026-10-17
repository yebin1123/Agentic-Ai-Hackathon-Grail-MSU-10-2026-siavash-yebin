export function LoadingState() {
  return (
    <section className="status-card status-card--loading">
      <p className="section-label">Working</p>
      <h2>Gathering evidence and drafting the summary</h2>
      <p className="meta-copy">
        The dashboard is waiting for the backend response. This state is mock-backed for now.
      </p>
    </section>
  )
}
