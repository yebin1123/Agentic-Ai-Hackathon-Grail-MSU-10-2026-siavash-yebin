import { formatTimestamp } from '../lib/format'

type WarningsBannerProps = {
  warnings: string[]
  generatedAt: string
  dataAsOf: string | null
}

export function WarningsBanner({ warnings, generatedAt, dataAsOf }: WarningsBannerProps) {
  return (
    <article className="card card--warnings">
      <h2>Data notes</h2>

      {warnings.length > 0 && (
        <ul className="warning-list">
          {Array.from(new Set(warnings)).map((warning, index) => (
            <li key={`${index}-${warning}`} className="warning-item">
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
