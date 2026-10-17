import type { MarketSnapshot } from '../types/stockAnalysis'

type MarketSnapshotCardProps = {
    snapshot: MarketSnapshot | null
}

const formatValue = (value: string | number | null, suffix = '') => {
    if (value === null || value === '') return 'Unavailable'
    return `${value}${suffix}`
}

const formatTimestamp = (value: string | null) => {
    if (!value) return 'Unavailable'
    return new Date(value).toLocaleString()
}

const formatCurrencyNumber = (value?: number | null) => {
    if (value === null || value === undefined) return 'Unavailable'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: value >= 1_000_000_000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1_000_000_000 ? 2 : 0,
    }).format(value)
}

export function MarketSnapshotCard({ snapshot }: MarketSnapshotCardProps) {
    return (
        <article className="card">
            <p className="section-label">Market snapshot</p>
            <h2>Latest quote context</h2>

            {!snapshot ? (
                <p className="empty-copy">No market snapshot is currently available.</p>
            ) : (
                <ul className="snapshot-grid">
                    <li className="snapshot-item">
                        <span className="snapshot-label">Price</span>
                        <span className="snapshot-value">{formatValue(snapshot.price)}</span>
                    </li>
                    <li className="snapshot-item">
                        <span className="snapshot-label">Currency</span>
                        <span className="snapshot-value">{formatValue(snapshot.currency)}</span>
                    </li>
                    <li className="snapshot-item">
                        <span className="snapshot-label">Change percent</span>
                        <span className="snapshot-value">{formatValue(snapshot.change_percent, '%')}</span>
                    </li>
                    <li className="snapshot-item">
                        <span className="snapshot-label">As of</span>
                        <span className="snapshot-value">{formatTimestamp(snapshot.as_of)}</span>
                    </li>
                    <li className="snapshot-item">
                        <span className="snapshot-label">Source</span>
                        <span className="snapshot-value">{formatValue(snapshot.source)}</span>
                    </li>
                    {snapshot.asset_type === 'crypto' ? (
                        <>
                            <li className="snapshot-item">
                                <span className="snapshot-label">Market cap</span>
                                <span className="snapshot-value">{formatCurrencyNumber(snapshot.market_cap_usd)}</span>
                            </li>
                            <li className="snapshot-item">
                                <span className="snapshot-label">24h volume</span>
                                <span className="snapshot-value">{formatCurrencyNumber(snapshot.volume_24h_usd)}</span>
                            </li>
                            <li className="snapshot-item">
                                <span className="snapshot-label">24h volatility</span>
                                <span className="snapshot-value">{formatValue(snapshot.volatility_24h, '%')}</span>
                            </li>
                        </>
                    ) : null}
                </ul>
            )}
        </article>
    )
}