import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AnalysisForm } from './components/AnalysisForm'
import { Dolphin } from './components/Dolphin'
import { EmptyState } from './components/EmptyState'
import { ErrorState } from './components/ErrorState'
import { ResearchAnswer } from './components/ResearchAnswer'
import { LoadingState } from './components/LoadingState'
import { MarketSnapshotCard } from './components/MarketSnapshotCard'
import { PriceChart } from './components/PriceChart'
import { RisksList } from './components/RisksList'
import { SourcesList } from './components/SourcesList'
import { WarningsBanner } from './components/WarningsBanner'
import { CryptoChat } from './components/CryptoChat'
import { ResearchContext } from './components/ResearchContext'
import { ProsCons } from './components/ProsCons'
import { analyzeCrypto, getAssets } from './lib/cryptoApi'
import type { Asset, CryptoAnalysisRequest, CryptoAnalysisResponse, ResearchProfile } from './types/crypto'

function App() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [draftProfile, setDraftProfile] = useState<ResearchProfile | null>(null)
  const [profileResetGeneration, setProfileResetGeneration] = useState(0)
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [completed, setCompleted] = useState<{ request: CryptoAnalysisRequest; response: CryptoAnalysisResponse } | null>(null)
  const result = completed?.response
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmitted, setLastSubmitted] = useState<CryptoAnalysisRequest | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const analysisController = useRef<AbortController | null>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    setAssetsLoading(true)
    setAssetsError(null)
    void getAssets(controller.signal).then((catalog) => {
      if (!controller.signal.aborted) setAssets(catalog)
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setAssetsError(err instanceof Error ? err.message : 'Could not load crypto assets.')
    }).finally(() => {
      if (!controller.signal.aborted) setAssetsLoading(false)
    })
    return () => controller.abort()
  }, [catalogAttempt])

  useEffect(() => () => {
    requestVersion.current += 1
    analysisController.current?.abort()
  }, [])

  const cancelAnalysis = () => {
    requestVersion.current += 1
    analysisController.current?.abort()
    setIsLoading(false)
    setCancelled(true)
  }

  const handleAnalyze = async (request: CryptoAnalysisRequest) => {
    analysisController.current?.abort()
    const version = ++requestVersion.current
    const controller = new AbortController()
    analysisController.current = controller
    setCompleted(null)
    setIsLoading(true)
    setError(null)
    setCancelled(false)
    setLastSubmitted(request)
    try {
      const response = await analyzeCrypto(request, controller.signal)
      if (!controller.signal.aborted && version === requestVersion.current) setCompleted({ request, response })
    } catch (err) {
      if (!controller.signal.aborted && version === requestVersion.current) setError(err instanceof Error ? err.message : 'Could not prepare the crypto overview. Please try again.')
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#research-form-title">Skip to research</a>
      <header className="site-header"><a className="brand" href="#" aria-label="Fin - Crypto Research Buddy"><span className="brand-word">fin<span className="brand-dot">.</span></span><span className="brand-description">Crypto Research Buddy</span></a><span className="header-note"><span className="status-dot" />A little clarity in a sea of crypto.</span></header>
      <section className="hero-panel" aria-labelledby="hero-title">
        <div className="hero-content"><div className="hero-kicker"><span className="tiny-wave" aria-hidden="true">~</span> Less noise. More perspective.</div>
          <h1 id="hero-title">Dive deeper.<br />Find your <em>clarity.</em></h1>
          <p className="hero-copy">Meet Fin, your crypto research buddy. Explore market context, understand the risks, and follow the sources. All in one calm corner of the ocean.</p>
          <div className="fin-introduction"><Dolphin /><div><strong>Hi, I'm Fin.</strong><p>I help you explore the data.<br />You stay at the helm.</p></div></div>
          <div className="hero-features"><span>Source-backed context</span><span>Independent price history</span><span>Crypto only</span></div>
        </div>
        <AnalysisForm assets={assets} assetsLoading={assetsLoading} assetsError={assetsError} onRetryAssets={() => setCatalogAttempt((attempt) => attempt + 1)} onSubmit={handleAnalyze} onCancel={cancelAnalysis} isLoading={isLoading} lastSubmitted={lastSubmitted} onProfileChange={setDraftProfile} onProfileReset={() => setProfileResetGeneration((value) => value + 1)} />
      </section>
      <aside className="disclosure"><span className="disclosure-icon" aria-hidden="true">i</span><p><strong>Deterministic snapshot dashboard.</strong> Research cards use snapshot data, not a live AI model or financial advice. Optional Gemini free-tier chat is separate and labeled with its configuration below; local research profiles are never sent to free chat.</p></aside>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {cancelled && <p className="status-card" role="status">Request cancelled. No previous results are shown. Choose an asset and explore again when ready.</p>}
      {!isLoading && !error && !result && !cancelled && <EmptyState />}
      {result && completed && <section className={`results-grid${result.answer_sections?.length ? ' results-grid--sections' : ''}`} aria-label="Crypto research results">
        <ResearchAnswer request={completed.request} response={result} />
        <ResearchContext request={completed.request} response={result} />
        <ProsCons response={result} />
        <MarketSnapshotCard snapshot={result.market_snapshot} />
        <PriceChart key={`${requestVersion.current}-${result.asset.id}`} asset={result.asset} />
        <RisksList risks={result.risks} />
        <SourcesList sources={result.sources} />
        <WarningsBanner warnings={result.meta.warnings} generatedAt={result.meta.generated_at} dataAsOf={result.meta.data_as_of} />
      </section>}
      <CryptoChat completedAsset={result?.asset ?? null} profile={draftProfile ?? undefined} profileResetGeneration={profileResetGeneration} />
      <footer className="site-footer"><span className="footer-brand">Fin &bull; Crypto Research Buddy</span><span>A little clarity in a sea of crypto.</span></footer>
    </main>
  )
}

export default App
