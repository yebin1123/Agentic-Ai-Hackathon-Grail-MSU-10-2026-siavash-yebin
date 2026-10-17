import type { Risk } from '../types/stockAnalysis'

type RisksListProps = {
  risks: Risk[]
}

export function RisksList({ risks }: RisksListProps) {
  return (
    <article className="card">
      <p className="section-label">Risks</p>
      <h2>Counterarguments and downside</h2>

      {risks.length === 0 ? (
        <p className="empty-copy">No risks were returned.</p>
      ) : (
        <ul className="bullet-list">
          {risks.map((risk) => (
            <li key={risk.title} className="bullet-item">
              <div className="item-title-row">
                <h3 className="item-title">{risk.title}</h3>
                <span className={`severity-tag severity-tag--${risk.severity}`}>{risk.severity}</span>
              </div>
              <p className="item-detail">{risk.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
