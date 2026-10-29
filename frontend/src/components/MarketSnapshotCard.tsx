import { formatAmount, formatCurrency, formatPercent, formatTimestamp, safeUrl } from '../lib/format'
import type { MarketSnapshot } from '../types/crypto'

export function MarketSnapshotCard({ snapshot }: { snapshot: MarketSnapshot | null | undefined }) {
  const sourceUrl = safeUrl(snapshot?.source_url)
  const metrics = [
    ['Price (USD)', formatCurrency(snapshot?.price_usd)],
    ['24h price change', formatPercent(snapshot?.change_24h_percent)],
    ['Market cap', formatAmount(snapshot?.market_cap_usd, true)],
    ['Fully diluted valuation', formatAmount(snapshot?.fully_diluted_valuation_usd, true)],
    ['24h volume (USD)', formatAmount(snapshot?.volume_24h_usd, true)],
    ['Volume scope', snapshot?.volume_scope || 'Unavailable'],
    ['Circulating supply', formatAmount(snapshot?.circulating_supply)],
    ['Maximum supply', formatAmount(snapshot?.max_supply)],
    ['24h high', formatCurrency(snapshot?.high_24h_usd)],
    ['24h low', formatCurrency(snapshot?.low_24h_usd)],
    ['Change from all-time high', formatPercent(snapshot?.ath_change_percent)],
  ]
  return (
    <article className="card card--snapshot"><div className="card-header"><div><p className="section-label">At the surface</p><h2>Market snapshot</h2></div><span className="pill pill--neutral">USD</span></div>
      {!snapshot ? <p className="empty-copy">The service did not return a market snapshot. Missing values are not estimates.</p> : <dl className="snapshot-grid">{metrics.map(([label, value]) => <div className="snapshot-item" key={label}><dt className="snapshot-label">{label}</dt><dd className="snapshot-value">{value}</dd></div>)}</dl>}
      <div className="snapshot-meta"><p>Provider: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{snapshot?.source || 'View provider'}</a> : snapshot?.source || 'Unavailable'}</p><p>Data as of: {formatTimestamp(snapshot?.as_of)}</p><p>Retrieved: {formatTimestamp(snapshot?.retrieved_at)}</p><p>Unavailable means missing data, not zero. No price estimates are substituted.</p></div>
    </article>
  )
}
