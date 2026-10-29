import type { Asset, CryptoAnalysisRequest, CryptoAnalysisResponse, CryptoHistory, Timeframe } from '../types/crypto'
import { normalizeProfile } from './profile'

const TIMEOUT_MS = 20_000

export async function requestJson<T>(path: string, init: RequestInit = {}, signal?: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const headers = new Headers(init.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    const response = await fetch(path, { ...init, signal: controller.signal, headers })
    const payload = await response.json().catch(() => null)
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    if (timedOut) throw new Error(`The research service took longer than ${timeoutMs / 1000} seconds. Please try again.`)
    if (!response.ok) {
      const detail = payload?.error?.message ?? payload?.detail ?? payload?.message
      throw new Error(typeof detail === 'string' && detail.trim()
        ? detail
        : `The research service returned HTTP ${response.status}. Please try again.`)
    }
    if (!payload || typeof payload !== 'object') throw new Error('The research service returned an invalid JSON response.')
    return payload as T
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
    if (timedOut) throw new Error(`The research service took longer than ${timeoutMs / 1000} seconds. Please try again.`)
    if (error instanceof TypeError) throw new Error('Cannot reach the research service. Check your connection and that the backend is running.')
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function getAssets(signal: AbortSignal): Promise<Asset[]> {
  const payload = await requestJson<{ assets: Asset[] }>('/api/v1/assets', {}, signal)
  if (!Array.isArray(payload.assets) || !payload.assets.every(validAsset)) throw new Error('The research service returned an invalid asset list.')
  return Array.from(new Map(payload.assets.map((asset) => [asset.id, asset])).values())
}

export async function searchAssets(query: string, signal: AbortSignal): Promise<{ assets: Asset[]; warnings: string[] }> {
  const q = query.trim()
  if (q.length < 2 || q.length > 100) throw new Error('Search must be between 2 and 100 characters.')
  const payload = await requestJson<{ assets: Asset[]; warnings: string[] }>(`/api/v1/assets/search?q=${encodeURIComponent(q)}`, {}, signal)
  if (!Array.isArray(payload.assets) || payload.assets.length > 20 || !payload.assets.every(validAsset) || !stringArray(payload.warnings)) {
    throw new Error('The research service returned invalid search results.')
  }
  return { assets: Array.from(new Map(payload.assets.map((asset) => [asset.id, asset])).values()), warnings: payload.warnings }
}

export async function getAsset(id: string, signal: AbortSignal): Promise<Asset> {
  const payload = await requestJson<{ asset: Asset }>(`/api/v1/assets/${encodeURIComponent(id)}`, {}, signal)
  if (!validAsset(payload.asset) || payload.asset.id !== id) throw new Error('The research service returned unexpected asset details. Select the asset again.')
  return payload.asset
}

function validAsset(value: unknown): value is Asset {
  if (!hasStrings(value, ['id', 'symbol', 'name', 'category'])) return false
  const asset = value as Asset
  return !!asset.id.trim() && (asset.provider_url == null || typeof asset.provider_url === 'string') &&
    (asset.platforms === undefined || (!!asset.platforms && typeof asset.platforms === 'object' && !Array.isArray(asset.platforms) && Object.values(asset.platforms).every((contract) => typeof contract === 'string')))
}

export async function analyzeCrypto(request: CryptoAnalysisRequest, signal: AbortSignal): Promise<CryptoAnalysisResponse> {
  const asset_id = request.asset_id.trim()
  const question = request.question.trim()
  if (!asset_id || !question) throw new Error('Choose a crypto asset and enter a research question.')
  const payload = await requestJson<CryptoAnalysisResponse>('/api/v1/crypto-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id, question, ...(request.profile ? { profile: normalizeProfile(request.profile) } : {}) }),
  }, signal)
  if (payload.analysis_mode !== 'deterministic' || payload.asset?.id !== asset_id ||
       !hasStrings(payload.asset, ['id', 'symbol', 'name', 'category']) || typeof payload.answer !== 'string' || typeof payload.request_id !== 'string' ||
       (payload.submitted_question !== undefined && typeof payload.submitted_question !== 'string') ||
       (payload.answer_sections !== undefined && (!recordArray(payload.answer_sections, ['topic', 'title', 'answer', 'status']) ||
         !payload.answer_sections.every((section) => ['answered', 'limited', 'unsupported'].includes(section.status) &&
           (section.limitation === null || typeof section.limitation === 'string')))) ||
      !payload.meta || !stringArray(payload.meta.warnings) ||
      !recordArray(payload.key_points, ['category', 'title', 'detail']) ||
      !recordArray(payload.risks, ['title', 'detail', 'severity']) ||
       !recordArray(payload.sources, ['title', 'url', 'source_type']) ||
       payload.sources.some((source) => source.source_id != null && typeof source.source_id !== 'string') ||
       (payload.applied_profile != null && !validProfile(payload.applied_profile)) ||
       (payload.personalized_notes !== undefined && !recordArray(payload.personalized_notes, ['title', 'detail'])) ||
       (payload.pros_cons !== undefined && (!payload.pros_cons || !['pros', 'cons', 'unknowns'].every((key) => {
         const items = payload.pros_cons?.[key as keyof typeof payload.pros_cons]
         return recordArray(items, ['title', 'detail']) && items?.every((item) => stringArray(item.source_ids) && typeof item.interpretation === 'boolean')
       })))) {
    throw new Error('The research service returned an unexpected crypto overview. Please try again.')
  }
  return payload
}

function validProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const normalized = normalizeProfile(value)
  const input = value as Record<string, unknown>
  return Object.keys(normalized).every((key) => key === 'interests'
    ? stringArray(input.interests) && (input.interests as string[]).every((item) => normalized.interests.includes(item as typeof normalized.interests[number]))
    : input[key] === normalized[key as keyof typeof normalized])
}

export async function getCryptoHistory(assetId: string, timeframe: Timeframe, signal: AbortSignal): Promise<CryptoHistory> {
  const payload = await requestJson<CryptoHistory>(`/api/v1/crypto-history/${encodeURIComponent(assetId)}?timeframe=${timeframe}`, {}, signal)
  if (payload.asset_id !== assetId || payload.timeframe !== timeframe || payload.currency !== 'USD' ||
      !Array.isArray(payload.points) || !stringArray(payload.warnings)) {
    throw new Error('The research service returned unexpected price history.')
  }
  return payload
}

function hasStrings(value: unknown, keys: string[]): boolean {
  return !!value && typeof value === 'object' && keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
}

function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function recordArray(value: unknown, keys: string[]): boolean {
  return Array.isArray(value) && value.every((item) => hasStrings(item, keys))
}
