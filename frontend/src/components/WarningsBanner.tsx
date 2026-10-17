type WarningsBannerProps = {
  warnings: string[]
  generatedAt: string
  dataAsOf: string | null
}

const formatTimestamp = (value: string | null) => {
  if (!value) return 'Unavailable'
  return new Date(value).toLocaleString()
}

export function WarningsBanner({ warnings, generatedAt, dataAsOf }: WarningsBannerProps) {
  return (
    <article className="card card--warnings">
      <p className="section-label">Freshness and caveats</p>
      <h2>Timestamps and warnings</h2>

      {warnings.length === 0 ? (
        <p className="empty-copy">No warnings were returned.</p>
      ) : (
        <ul className="warning-list">
          {warnings.map((warning) => (
            <li key={warning} className="warning-item">
              <p className="meta-copy">{warning}</p>
            </li>
          ))}
        </ul>
      )}

      <ul className="meta-list">
        <li className="meta-item">
          <span className="snapshot-label">Generated at</span>
          <p className="meta-copy">{formatTimestamp(generatedAt)}</p>
        </li>
        <li className="meta-item">
          <span className="snapshot-label">Data as of</span>
          <p className="meta-copy">{formatTimestamp(dataAsOf)}</p>
        </li>
      </ul>
    </article>
  )
}
