import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Asset, CryptoAnalysisRequest, ResearchProfile } from '../types/crypto'
import { AssetPicker } from './AssetPicker'
import { ProfilePanel } from './ProfilePanel'
import { defaultProfile, loadProfile, normalizeProfile, profilesEqual, removeProfile, saveProfile } from '../lib/profile'

type Props = {
  assets: Asset[]
  assetsLoading: boolean
  assetsError: string | null
  onRetryAssets: () => void
  onSubmit: (request: CryptoAnalysisRequest) => Promise<void>
  onCancel: () => void
  isLoading: boolean
  lastSubmitted: CryptoAnalysisRequest | null
  onProfileChange?: (profile: ResearchProfile | null) => void
  onProfileReset?: () => void
}

const prompts = [
  { label: '24h price & volume', question: 'What are the 24-hour price change and trading volume in the current snapshot?' },
  { label: 'Supply & valuation', question: 'What are the circulating supply, maximum supply, market cap, and fully diluted valuation in the current snapshot?' },
  { label: 'Risks & data gaps', question: 'What risks and data gaps are available from the current snapshot?' },
]

export function AnalysisForm({ assets, assetsLoading, assetsError, onRetryAssets, onSubmit, onCancel, isLoading, lastSubmitted, onProfileChange, onProfileReset }: Props) {
  const [selected, setSelected] = useState<Asset | null>(assets[0] ?? null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [profile, setProfile] = useState(defaultProfile)
  const [profileEnabled, setProfileEnabled] = useState(false)
  const [remember, setRemember] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [question, setQuestion] = useState(prompts[0].question)
  useEffect(() => {
    if (!selected && assets.length) setSelected(assets[0])
  }, [assets, selected])
  useEffect(() => {
    const saved = loadProfile()
    if (saved.profile) setProfile(saved.profile)
    setStorageError(saved.error)
  }, [])
  useEffect(() => { onProfileChange?.(normalizeProfile(profile)) }, [profile, onProfileChange])
  const updateProfile = (value: ResearchProfile) => {
    setProfile(value)
    if (remember) setStorageError(saveProfile(value, true))
  }
  const toggleRemember = (consent: boolean) => {
    setRemember(consent)
    setStorageError(consent ? saveProfile(profile, true) : removeProfile())
  }
  const resetProfile = () => {
    onProfileReset?.()
    setProfile(defaultProfile())
    setProfileEnabled(false)
    setRemember(false)
    setStorageError(removeProfile())
  }
  const submittedProfile = profileEnabled ? normalizeProfile(profile) : undefined
  const hasPendingDraft = !!lastSubmitted && (selected?.id !== lastSubmitted.asset_id || question.trim() !== lastSubmitted.question.trim() || !profilesEqual(submittedProfile, lastSubmitted.profile))
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selected && question.trim() && !isLoading && !detailLoading) void onSubmit({ asset_id: selected.id, question: question.trim(), ...(submittedProfile ? { profile: submittedProfile } : {}) })
  }

  return (
    <form className="analysis-form" onSubmit={handleSubmit} aria-labelledby="research-form-title">
      <div className="card-header"><div><p className="section-label">Your research desk</p><h2 id="research-form-title">Choose your next deep dive.</h2></div><span className="step-mark">01</span></div>
      <AssetPicker assets={assets} selected={selected} disabled={isLoading} assetsLoading={assetsLoading} onSelect={setSelected} onDetailLoading={setDetailLoading} />
      <div id="asset-status" className="form-help-text" aria-live="polite">
        {assetsError ? <><span className="error-copy">{assetsError}</span> <button className="text-button" type="button" onClick={onRetryAssets}>Retry asset list</button></> : selected ? `${selected.category.replaceAll('_', ' ')} / ${selected.symbol.toUpperCase()} / USD market data` : assetsLoading ? 'Connecting to the asset catalog.' : 'The backend has not listed any supported assets.'}
      </div>
      <label className="form-field" htmlFor="question"><span className="form-label">What would you like to explore?</span></label>
      <textarea id="question" className="form-input form-textarea" value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} maxLength={1000} required disabled={isLoading} aria-describedby="question-help draft-help" placeholder="Ask about 24h price change, volume, supply, valuation, or available risks." />
      <div className="prompt-list" aria-label="Example research questions">{prompts.map((prompt) => <button className="prompt-button" type="button" key={prompt.label} disabled={isLoading} onClick={() => setQuestion(prompt.question)}>{prompt.label}</button>)}</div>
      <p className="form-help-text" id="question-help">Snapshot questions are supported. Forecasts, price-move causes, and security audits are not connected.</p>
      <ProfilePanel profile={profile} enabled={profileEnabled} remember={remember} error={storageError} disabled={isLoading} onChange={updateProfile} onEnabled={setProfileEnabled} onRemember={toggleRemember} onReset={resetProfile} />
      <p className="form-help-text" id="draft-help">Changing the draft does not update the answer until you submit.</p>
      {hasPendingDraft && !isLoading && <p className="draft-notice" role="status">Draft changed - resubmit to get a new answer.</p>}
      <button className="primary-button" type="submit" disabled={isLoading || detailLoading || !selected || !question.trim()}>{isLoading ? 'Preparing answer...' : lastSubmitted ? 'Resubmit question' : 'Explore this asset'}<span aria-hidden="true">{isLoading ? '...' : '\u2197'}</span></button>
      {isLoading && <button className="text-button" type="button" onClick={onCancel}>Cancel request</button>}
    </form>
  )
}
