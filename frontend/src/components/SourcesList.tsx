import type { Source } from '../types/stockAnalysis'

type SourcesListProps = {
  sources: Source[]
}

const formatTimestamp = (value: string | null) => {
  if (!value) return 'Published date unavailable'
  return new Date(value).toLocaleString()
}

export function SourcesList({ sources }: SourcesListProps) {
  return (
    <article className="card card--sources">
      <p className="section-label">Sources</p>
      <h2>Retrieved evidence</h2>

      {sources.length === 0 ? (
        <p className="empty-copy">No sources were returned.</p>
      ) : (
        <ul className="source-list">
          {sources.map((source) => (
            <li key={`${source.url}-${source.title}`} className="source-item">
              <a className="source-link" href={source.url} target="_blank" rel="noreferrer">
                <h3 className="source-title">{source.title}</h3>
              </a>
              <p className="source-meta">
                {source.publisher ?? 'Unknown publisher'} · {source.source_type.replace('_', ' ')} · {formatTimestamp(source.published_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
