import type { MarketSnapshot } from '../types/stockAnalysis'

type PriceChartProps = {
    snapshot: MarketSnapshot | null
}

const CHART_WIDTH = 560
const CHART_HEIGHT = 220
const PADDING = 24

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value)

export function PriceChart({ snapshot }: PriceChartProps) {
    const history = snapshot?.history ?? []

    if (!history.length) {
        return (
            <article className="card card--chart">
                <p className="section-label">Price trend</p>
                <h2>Recent market graph</h2>
                <p className="empty-copy">No recent price history is available from the backend for this ticker.</p>
            </article>
        )
    }

    const closes = history.map((point) => point.close)
    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = max - min || 1

    const points = history
        .map((point, index) => {
            const x = PADDING + (index / Math.max(history.length - 1, 1)) * (CHART_WIDTH - PADDING * 2)
            const y = CHART_HEIGHT - PADDING - ((point.close - min) / range) * (CHART_HEIGHT - PADDING * 2)
            return `${x},${y}`
        })
        .join(' ')

    const firstLabel = new Date(history[0].timestamp).toLocaleDateString()
    const lastLabel = new Date(history[history.length - 1].timestamp).toLocaleDateString()

    return (
        <article className="card card--chart">
            <p className="section-label">Price trend</p>
            <h2>Recent market graph</h2>

            <div className="chart-shell">
                <div className="chart-axis-labels">
                    <span>{formatCurrency(max)}</span>
                    <span>{formatCurrency(min)}</span>
                </div>
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="price-chart" role="img" aria-label="Recent price chart">
                    <defs>
                        <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(37, 99, 235, 0.32)" />
                            <stop offset="100%" stopColor="rgba(37, 99, 235, 0.02)" />
                        </linearGradient>
                    </defs>
                    <polyline
                        fill="none"
                        stroke="rgba(148, 163, 184, 0.35)"
                        strokeWidth="1"
                        points={`${PADDING},${PADDING} ${CHART_WIDTH - PADDING},${PADDING}`}
                    />
                    <polyline
                        fill="none"
                        stroke="rgba(148, 163, 184, 0.35)"
                        strokeWidth="1"
                        points={`${PADDING},${CHART_HEIGHT - PADDING} ${CHART_WIDTH - PADDING},${CHART_HEIGHT - PADDING}`}
                    />
                    <polygon
                        fill="url(#priceGradient)"
                        points={`${points} ${CHART_WIDTH - PADDING},${CHART_HEIGHT - PADDING} ${PADDING},${CHART_HEIGHT - PADDING}`}
                    />
                    <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={points}
                    />
                </svg>
                <div className="chart-footer">
                    <span>{firstLabel}</span>
                    <span>{lastLabel}</span>
                </div>
            </div>
        </article>
    )
}