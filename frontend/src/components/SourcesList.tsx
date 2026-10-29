import type { Source } from '../types/crypto'
import { formatTimestamp, safeUrl } from '../lib/format'

type SourcesListProps = {
  sources: Source[]
}

export function SourcesList({ sources }: SourcesListProps) {
  return (
    <article className="card card--sources">
      <p className="section-label">Sources</p>
      <h2>Follow the sources</h2>
      <p className="sources-intro">Open the original evidence and check its date. Links lead to external publishers; a source is not an endorsement.</p>

      {sources.length === 0 ? (
        <p className="empty-copy">No sources were returned.</p>
      ) : (
        <ul className="source-list">
          {sources.map((source, index) => (
            <li key={`${index}-${source.url}-${source.title}`} className="source-item">
              <span className="source-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div><h3 className="source-title">{safeUrl(source.url) ? <a className="source-link" href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">&nearr;</span></a> : source.title}</h3>
               <p className="source-meta">
                {source.source_id && <>ID: {source.source_id} / </>}
                {source.publisher || 'Unknown publisher'} · {source.source_type.replaceAll('_', ' ')} · Published: {formatTimestamp(source.published_at)}
              </p>{!safeUrl(source.url) && <p className="source-meta">Source link unavailable or unsupported.</p>}</div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
