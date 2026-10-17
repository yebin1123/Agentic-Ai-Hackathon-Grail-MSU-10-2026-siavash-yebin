import { useMemo, useState } from 'react'
import './App.css'
import { AnalysisForm } from './components/AnalysisForm'
import { EmptyState } from './components/EmptyState'
import { ErrorState } from './components/ErrorState'
import { KeyPointsList } from './components/KeyPointsList'
import { LoadingState } from './components/LoadingState'
import { MarketSnapshotCard } from './components/MarketSnapshotCard'
import { PriceChart } from './components/PriceChart'
import { RisksList } from './components/RisksList'
import { SourcesList } from './components/SourcesList'
import { WarningsBanner } from './components/WarningsBanner'
import { analyzeStock } from './lib/stockAnalysisApi'
import type { StockAnalysisRequest, StockAnalysisResponse } from './types/stockAnalysis'

function App() {
  const [result, setResult] = useState<StockAnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmitted, setLastSubmitted] = useState<StockAnalysisRequest | null>(null)

  const subtitle = useMemo(() => {
    if (!lastSubmitted) return 'Ask one focused question about a stock and get a structured, source-backed summary.'
    return `Latest request: ${lastSubmitted.ticker} — ${lastSubmitted.question}`
  }, [lastSubmitted])

  const handleAnalyze = async (request: StockAnalysisRequest) => {
    setIsLoading(true)
    setError(null)
    setLastSubmitted(request)

    try {
      const response = await analyzeStock(request)
      setResult(response)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
      <main className="app-shell">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Hackathon MVP</p>
            <h1>Stock Research Buddy</h1>
            <p className="hero-copy">{subtitle}</p>
          </div>
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
        </section>

        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!isLoading && !error && !result ? <EmptyState /> : null}

        {result ? (
            <section className="results-grid">
              <article className="card card--answer">
                <div className="card-header">
                  <div>
                    <p className="section-label">Analysis</p>
                    <h2>
                      {result.company_name ?? result.ticker}
                    </h2>
                  </div>
                  <span className="pill">Request ID: {result.request_id}</span>
                </div>
                <p className="answer-text">{result.answer}</p>
              </article>

              <MarketSnapshotCard snapshot={result.market_snapshot} />
              <PriceChart snapshot={result.market_snapshot} />
              <WarningsBanner warnings={result.meta.warnings} generatedAt={result.meta.generated_at} dataAsOf={result.meta.data_as_of} />
              <KeyPointsList keyPoints={result.key_points} />
              <RisksList risks={result.risks} />
              <SourcesList sources={result.sources} />
            </section>
        ) : null}
      </main>
  )
}

export default App
