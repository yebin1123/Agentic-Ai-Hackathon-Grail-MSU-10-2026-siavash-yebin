import { useEffect, useId, useRef, useState } from 'react'
import { getCryptoHistory } from '../lib/cryptoApi'
import { formatCurrency, formatPercent, formatTimestamp, safeUrl } from '../lib/format'
import { chartGeometry, prepareHistory } from '../lib/historyChart'
import type { Asset, CryptoHistory, Timeframe } from '../types/crypto'

const timeframes: { value: Timeframe; label: string; name: string }[] = [
  { value: '1d', label: '1D', name: '1 day' }, { value: '1w', label: '1W', name: '1 week' },
  { value: '1m', label: '1M', name: '1 month' }, { value: '1y', label: '1Y', name: '1 year' },
]

export function PriceChart({ asset }: { asset: Asset }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1w')
  const [history, setHistory] = useState<CryptoHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const activeController = useRef<AbortController | null>(null)
  const id = useId()

  useEffect(() => {
    const controller = new AbortController()
    activeController.current = controller
    setLoading(true)
    setHistory(null)
    setError(null)
    void getCryptoHistory(asset.id, timeframe, controller.signal).then((response) => {
      if (!controller.signal.aborted) setHistory(response)
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load crypto price history.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [asset.id, timeframe, attempt])

  const changeTimeframe = (next: Timeframe) => {
    if (next === timeframe) return
    activeController.current?.abort()
    setHistory(null)
    setError(null)
    setLoading(true)
    setTimeframe(next)
  }
  const retry = () => {
    activeController.current?.abort()
    setHistory(null)
    setError(null)
    setLoading(true)
    setAttempt((value) => value + 1)
  }
  const prepared = prepareHistory(history?.points ?? [])
  const geometry = chartGeometry(prepared.points)
  const dateLabel = (time: number) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
    ...(timeframe === '1d' ? { hour: '2-digit', minute: '2-digit', hour12: false } : { year: 'numeric' }),
  }).format(new Date(time))
  const sourceUrl = safeUrl(history?.source_url)

  return (
    <article className="card card--chart" aria-labelledby={`${id}-heading`}>
      <div className="card-header"><div><p className="section-label">Ride the market currents</p><h2 id={`${id}-heading`}>{asset.symbol.toUpperCase()} price history</h2><p className="meta-copy">USD / historical observations, not a forecast</p></div>
        <div className="timeframes" role="group" aria-label="Price history timeframe">{timeframes.map((frame) => <button type="button" key={frame.value} aria-label={frame.name} aria-pressed={timeframe === frame.value} className={timeframe === frame.value ? 'timeframe-button is-active' : 'timeframe-button'} onClick={() => changeTimeframe(frame.value)}>{frame.label}</button>)}</div>
      </div>
      <div className="chart-content" aria-busy={loading}>
        {loading ? <div className="chart-status" role="status"><span className="loading-ripple" aria-hidden="true" /><strong>Loading {timeframes.find((frame) => frame.value === timeframe)?.name} of price history...</strong><p>This request is separate from your research overview.</p></div>
          : error ? <div className="chart-status chart-status--error" role="alert"><strong>Price history could not be loaded.</strong><p>{error}</p><button className="secondary-button" type="button" onClick={retry}>Retry history</button></div>
          : !geometry ? <div className="chart-status" role="status"><strong>No usable price history for this timeframe.</strong><p>The provider returned no valid observations. Try another timeframe; the research overview will stay unchanged.</p></div>
          : <>
            <div className="chart-stats"><div><span>Returned-period change</span><strong>{formatPercent(history?.period_change_percent)}</strong></div><div><span>Sampled maximum drawdown</span><strong>{formatPercent(history?.max_drawdown_percent)}</strong></div><div><span>Valid observations</span><strong>{prepared.points.length.toLocaleString('en-US')}</strong></div></div>
            <div className="chart-scroll"><svg viewBox="0 0 900 310" className="price-chart" role="img" aria-labelledby={`${id}-title ${id}-description`}>
              <title id={`${id}-title`}>{asset.name} price history in USD, {timeframes.find((frame) => frame.value === timeframe)?.name}</title>
              <desc id={`${id}-description`}>{prepared.points.length} valid observations from {formatTimestamp(prepared.points[0].timestamp)} to {formatTimestamp(prepared.points[prepared.points.length - 1].timestamp)}. Minimum {formatCurrency(geometry.min)}, maximum {formatCurrency(geometry.max)}. Horizontal positions represent elapsed time, with dates in UTC. {geometry.min === geometry.max ? 'All prices are equal; values are centered vertically.' : ''} Exact observations are in the price data table.</desc>
              <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#249a98" stopOpacity=".2" /><stop offset="100%" stopColor="#249a98" stopOpacity=".01" /></linearGradient></defs>
              {[0, .5, 1].map((fraction) => {
                const y = geometry.top + fraction * (geometry.bottom - geometry.top)
                const value = geometry.max * (1 - fraction) + geometry.min * fraction
                return <g key={fraction}><line x1={geometry.left} x2={geometry.right} y1={y} y2={y} className="chart-gridline" /><text x={geometry.left - 14} y={y + 4} textAnchor="end" className="chart-label">{formatCurrency(value, geometry.max > geometry.min ? (geometry.max - geometry.min) / 2 : undefined)}</text></g>
              })}
              {geometry.coordinates.length > 1 && <><path d={`M ${geometry.coordinates.map((point) => `${point.x},${point.y}`).join(' L ')} L ${geometry.coordinates[geometry.coordinates.length - 1].x},${geometry.bottom} L ${geometry.coordinates[0].x},${geometry.bottom} Z`} fill={`url(#${id}-fill)`} /><polyline points={geometry.coordinates.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#167c83" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></>}
              {(geometry.coordinates.length === 1 ? geometry.coordinates : [geometry.coordinates[geometry.coordinates.length - 1]]).map((point) => <circle key={point.time} cx={point.x} cy={point.y} r="5" fill="#167c83" stroke="#fff" strokeWidth="2"><title>{formatTimestamp(point.timestamp)}: {formatCurrency(point.price)}</title></circle>)}
              {(geometry.firstTime === geometry.lastTime ? [.5] : [0, .5, 1]).map((fraction) => <text key={fraction} x={geometry.left + fraction * (geometry.right - geometry.left)} y={280} className="chart-label" textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}>{dateLabel(geometry.firstTime + fraction * (geometry.lastTime - geometry.firstTime))}</text>)}
              <text x={geometry.right} y={302} textAnchor="end" className="chart-label">Time (UTC)</text>
            </svg></div>
            <details className="chart-details"><summary>View accessible price data ({prepared.points.length} observations)</summary><div className="data-table-scroll" tabIndex={0} role="region" aria-label="Historical price observations"><table><caption>{asset.name} / {timeframe} / USD / all timestamps UTC</caption><thead><tr><th scope="col">Timestamp (UTC)</th><th scope="col">Price (USD)</th></tr></thead><tbody>{prepared.points.map((point) => <tr key={point.time}><td>{formatTimestamp(point.timestamp)}</td><td>{formatCurrency(point.price)}</td></tr>)}</tbody></table></div></details>
          </>}
      </div>
       {!loading && !error && history && <div className="history-meta"><p className="meta-copy">Provider: {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{history.source || 'View provider'}</a> : history.source || 'Unavailable'} / Sampling: {history.sampling || 'Unavailable'}</p><p className="meta-copy">Coverage: {formatTimestamp(history.coverage_start)} to {formatTimestamp(history.coverage_end)}</p><p className="meta-copy">Retrieved: {formatTimestamp(history.retrieved_at)}</p><p className="meta-copy">Period change and drawdown use only returned observations. Sampled drawdown can miss intraperiod lows; neither metric predicts returns.</p>
        {prepared.discarded > 0 && <p className="chart-warning">{prepared.discarded} invalid or duplicate observation(s) omitted from the chart.</p>}
        {history.warnings.length > 0 && <ul className="chart-warnings" aria-label="Price history warnings">{history.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
      </div>}
    </article>
  )
}
