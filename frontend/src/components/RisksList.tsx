import type { Risk } from '../types/crypto'

type RisksListProps = {
  risks: Risk[]
}

export function RisksList({ risks }: RisksListProps) {
  return (
    <article className="card card--risks">
      <p className="section-label">Watch the undertow</p>
      <h2>Crypto risks &amp; downside</h2>
      <p className="risk-disclaimer">Available risk context, not a complete security or regulatory assessment.</p>

      {risks.length === 0 ? (
        <p className="empty-copy">No asset-specific risks were returned. This does not mean the asset is safe or risk-free.</p>
      ) : (
        <ul className="bullet-list">
          {risks.map((risk, index) => (
            <li key={`${index}-${risk.title}`} className="bullet-item">
              <div className="item-title-row">
                <h3 className="item-title">{risk.title}</h3>
                <span className={`severity-tag severity-tag--${['high', 'medium', 'low'].includes(risk.severity) ? risk.severity : 'unknown'}`}>{risk.severity || 'unknown'}</span>
              </div>
              <p className="item-detail">{risk.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
