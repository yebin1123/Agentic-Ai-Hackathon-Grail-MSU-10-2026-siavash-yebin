import type { KeyPoint } from '../types/crypto'

type KeyPointsListProps = {
  keyPoints: KeyPoint[]
}

export function KeyPointsList({ keyPoints }: KeyPointsListProps) {
  return (
    <article className="card">
      <p className="section-label">Key points</p>
      <h2>Below the surface</h2>

      {keyPoints.length === 0 ? (
        <p className="empty-copy">No key points were returned.</p>
      ) : (
        <ul className="bullet-list">
          {keyPoints.map((point, index) => (
            <li key={`${index}-${point.category}-${point.title}`} className="bullet-item">
              <div className="item-title-row">
                <h3 className="item-title">{point.title}</h3>
                <span className="item-tag">{point.category.replaceAll('_', ' ')}</span>
              </div>
              <p className="item-detail">{point.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
