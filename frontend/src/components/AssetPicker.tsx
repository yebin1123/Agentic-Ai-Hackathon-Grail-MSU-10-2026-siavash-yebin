import { useEffect, useRef, useState } from 'react'
import type { Asset } from '../types/crypto'
import { getAsset, searchAssets } from '../lib/cryptoApi'
import { safeExternalUrl } from '../lib/links'

export function AssetIdentity({ asset }: { asset: Asset }) {
  const platforms = Object.entries(asset.platforms ?? {})
  const provider = safeExternalUrl(asset.provider_url)
  return <div className="asset-identity"><p>ID: <strong>{asset.id}</strong> / {asset.symbol.toUpperCase()}</p>
    {platforms.length > 0 && <ul>{platforms.map(([chain, contract]) => <li key={chain}><strong>{chain || 'Unspecified chain'}</strong>: {contract || 'Contract unavailable'}</li>)}</ul>}
    {provider && <a href={provider} target="_blank" rel="noopener noreferrer">Provider asset page</a>}
  </div>
}

type Props = {
  assets: Asset[]
  selected: Asset | null
  disabled: boolean
  assetsLoading: boolean
  onSelect: (asset: Asset) => void
  onDetailLoading: (loading: boolean) => void
}

export function AssetPicker({ assets, selected, disabled, assetsLoading, onSelect, onDetailLoading }: Props) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Asset[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  const [searching, setSearching] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const searchVersion = useRef(0)
  const searchController = useRef<AbortController | null>(null)
  const detailController = useRef<AbortController | null>(null)
  const detailVersion = useRef(0)

  useEffect(() => {
    const version = ++searchVersion.current
    const controller = new AbortController()
    searchController.current = controller
    const q = query.trim()
    if (q.length < 2 || q.length > 100) return () => controller.abort()
    const timer = window.setTimeout(() => {
      void searchAssets(q, controller.signal).then((response) => {
        if (controller.signal.aborted || version !== searchVersion.current) return
        setCandidates(response.assets)
        setWarnings(response.warnings)
        setSearchStatus(response.assets.length ? `${response.assets.length} candidates. Select an exact asset; matching tickers can refer to different tokens.` : 'No candidates found. Try a different name or ID.')
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && version === searchVersion.current) setSearchStatus(error instanceof Error ? error.message : 'Search unavailable. Try again.')
      }).finally(() => {
        if (!controller.signal.aborted && version === searchVersion.current) setSearching(false)
      })
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  useEffect(() => () => {
    detailVersion.current += 1
    detailController.current?.abort()
  }, [])

  const choose = async (candidate: Asset) => {
    detailController.current?.abort()
    const version = ++detailVersion.current
    const controller = new AbortController()
    detailController.current = controller
    setDetailId(candidate.id)
    setDetailError(null)
    onDetailLoading(true)
    try {
      const asset = await getAsset(candidate.id, controller.signal)
      if (!controller.signal.aborted && version === detailVersion.current) onSelect(asset)
    } catch (error) {
      if (!controller.signal.aborted && version === detailVersion.current) setDetailError(`${error instanceof Error ? error.message : 'Could not load full asset details.'} Current selection has not changed.`)
    } finally {
      if (!controller.signal.aborted && version === detailVersion.current) {
        setDetailId(null)
        onDetailLoading(false)
      }
    }
  }

  const selectFeatured = (id: string) => {
    detailController.current?.abort()
    detailVersion.current += 1
    setDetailId(null)
    setDetailError(null)
    onDetailLoading(false)
    const asset = assets.find((item) => item.id === id)
    if (asset) onSelect(asset)
  }
  const options = selected && !assets.some((asset) => asset.id === selected.id) ? [...assets, selected] : assets

  return <div className="asset-picker">
    <label className="form-field" htmlFor="asset"><span className="form-label">Crypto asset / featured list</span></label>
    <select id="asset" className="form-input" value={selected?.id ?? ''} onChange={(event) => selectFeatured(event.target.value)} disabled={assetsLoading || !options.length || disabled} aria-describedby="asset-status">
      {!options.length && <option value="">{assetsLoading ? 'Loading featured crypto assets...' : 'No featured assets available'}</option>}
      {options.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.symbol.toUpperCase()}) / {asset.id}</option>)}
    </select>
    <label className="form-field" htmlFor="asset-search"><span className="form-label">Search more assets by name, symbol, or ID</span></label>
    <input id="asset-search" className="form-input" type="search" value={query} maxLength={100} disabled={disabled} autoComplete="off" aria-describedby="search-coverage search-status" onChange={(event) => {
      searchVersion.current += 1
      searchController.current?.abort()
      const q = event.target.value.trim()
      const searchable = q.length >= 2 && q.length <= 100
      setCandidates([])
      setWarnings([])
      setSearching(searchable)
      setSearchStatus(searchable ? 'Searching the provider catalog...' : q && q.length < 2 ? 'Enter at least 2 characters to search.' : '')
      setQuery(event.target.value)
    }} />
    <p id="search-coverage" className="form-help-text">Broad provider catalog search, not a guarantee of every token. Data coverage, contracts, and history vary; verify the ID and chain before selecting. Searching does not change your selection.</p>
    <p id="search-status" className="form-help-text" role="status" aria-live="polite">{searchStatus}</p>
    {warnings.length > 0 && <ul className="chart-warnings">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {!!candidates.length && <ul className="asset-candidates" aria-label="Asset search candidates" aria-busy={searching}>{candidates.map((candidate) => <li key={candidate.id}>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => void choose(candidate)} aria-label={`Select ${candidate.name}, ${candidate.symbol.toUpperCase()}, ID ${candidate.id}`}>{candidate.name} ({candidate.symbol.toUpperCase()}){selected?.id === candidate.id ? ' / selected' : ''}</button>
      <AssetIdentity asset={candidate} />
    </li>)}</ul>}
    {detailId && <p className="form-help-text" role="status">Loading full details for {detailId}. The current selection is retained until details arrive.</p>}
    {detailError && <p className="form-help-text error-copy" role="alert">{detailError}</p>}
    {selected && <div className="selected-asset"><strong>Selected: {selected.name}</strong><AssetIdentity asset={selected} /></div>}
  </div>
}
