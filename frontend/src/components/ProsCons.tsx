import type { CryptoAnalysisResponse } from '../types/crypto'
import { safeExternalUrl } from '../lib/links'

export function ProsCons({ response }: { response: CryptoAnalysisResponse }) {
  const groups = [['pros', 'Potential strengths'], ['cons', 'Potential concerns'], ['unknowns', 'Unknowns']] as const
  return <article className="card card--arguments" aria-labelledby="arguments-title">
    <p className="section-label">Evidence and interpretation</p><h2 id="arguments-title">Strengths, concerns &amp; unknowns</h2>
    <p className="sources-intro">Potential considerations for research, not a recommendation. Interpretations are labeled; evidence links appear only when returned source IDs match.</p>
    <div className="argument-groups">{groups.map(([key, label]) => <section key={key} aria-label={label}><h3>{label}</h3>
      {response.pros_cons?.[key]?.length ? <ul className="bullet-list">{response.pros_cons[key].map((item, index) => <li key={index} className="bullet-item">
        <h4 className="item-title">{item.title}</h4><p className="item-detail">{item.detail}</p>
        <p className="form-help-text">{item.interpretation ? 'Interpretation, not a direct source claim.' : 'Source-based claim.'}</p>
        {item.source_ids.length ? <ul className="argument-sources">{Array.from(new Set(item.source_ids)).map((id) => {
          const source = response.sources.find((candidate) => candidate.source_id === id)
          const url = safeExternalUrl(source?.url)
          return <li key={id}>{source && url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title} ({id})</a> : <span>Evidence link unavailable for source ID {id}.</span>}</li>
        })}</ul> : <p className="form-help-text">No source IDs supplied for this item.</p>}
      </li>)}</ul> : <p className="meta-copy">No {label.toLowerCase()} were returned. This does not mean none exist.</p>}
    </section>)}</div>
  </article>
}
