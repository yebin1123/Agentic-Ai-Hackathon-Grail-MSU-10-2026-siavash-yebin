type ErrorStateProps = {
  message: string
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <section className="status-card status-card--error">
      <p className="section-label">Error</p>
      <h2>Could not complete the request</h2>
      <p className="meta-copy">{message}</p>
    </section>
  )
}
