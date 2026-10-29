type ErrorStateProps = {
  message: string
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <section className="status-card status-card--error" role="alert">
      <p className="section-label">Error</p>
      <h2>Could not complete the request</h2>
      <p className="meta-copy">{message}</p>
      <p className="meta-copy">Your question is kept in the research form. Try submitting again; no invented results are shown.</p>
    </section>
  )
}
