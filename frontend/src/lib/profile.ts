import type { ResearchProfile } from '../types/crypto'

export const PROFILE_STORAGE_KEY = 'fin.research-profile.v1'
export const profileOptions = {
  experience: ['beginner', 'intermediate', 'advanced'],
  goal: ['learn', 'long_term_research', 'trading_risk'],
  horizon: ['short', 'medium', 'long'],
  loss_tolerance: ['low', 'medium', 'high'],
  loss_capacity: ['low', 'medium', 'high', 'unknown'],
  liquidity_need: ['soon', 'flexible', 'unknown'],
  explanation: ['concise', 'detailed'],
  interests: ['defi', 'infrastructure', 'security', 'payments', 'stablecoins', 'memecoins'],
} as const

export function defaultProfile(): ResearchProfile {
  return { display_name: '', experience: 'beginner', goal: 'learn', horizon: 'long', loss_tolerance: 'low', loss_capacity: 'unknown', liquidity_need: 'unknown', explanation: 'concise', interests: [] }
}

export function normalizeProfile(value: unknown): ResearchProfile {
  const result = defaultProfile()
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  if (typeof input.display_name === 'string') result.display_name = input.display_name.trim().slice(0, 40)
  for (const key of ['experience', 'goal', 'horizon', 'loss_tolerance', 'loss_capacity', 'liquidity_need', 'explanation'] as const) {
    if ((profileOptions[key] as readonly unknown[]).includes(input[key])) Object.assign(result, { [key]: input[key] })
  }
  if (Array.isArray(input.interests)) result.interests = profileOptions.interests.filter((item) => (input.interests as unknown[]).includes(item))
  return result
}

type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browserStorage: StorageAccess = () => window.localStorage

export function loadProfile(storage: StorageAccess = browserStorage): { profile: ResearchProfile | null; error: string | null } {
  try {
    const stored = storage().getItem(PROFILE_STORAGE_KEY)
    if (!stored) return { profile: null, error: null }
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid saved preferences')
    return { profile: normalizeProfile(parsed), error: null }
  } catch {
    return { profile: null, error: 'Saved preferences could not be read. You can still use a session-only profile.' }
  }
}

export function saveProfile(profile: ResearchProfile, consent: boolean, storage: StorageAccess = browserStorage): string | null {
  if (!consent) return null
  try {
    storage().setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfile(profile)))
    return null
  } catch {
    return 'Preferences could not be saved in this browser. Your profile still works for this session.'
  }
}

export function removeProfile(storage: StorageAccess = browserStorage): string | null {
  try {
    storage().removeItem(PROFILE_STORAGE_KEY)
    return null
  } catch {
    return 'Saved preferences could not be removed. Clear this site\'s browser storage to remove them; the session profile has been reset.'
  }
}

export function profilesEqual(a?: ResearchProfile | null, b?: ResearchProfile | null): boolean {
  return a == null || b == null ? a == null && b == null : JSON.stringify(normalizeProfile(a)) === JSON.stringify(normalizeProfile(b))
}
