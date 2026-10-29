export type Asset = { id: string; symbol: string; name: string; category: string; platforms?: Record<string, string>; provider_url?: string | null }
export type ResearchProfile = {
  display_name: string
  experience: 'beginner' | 'intermediate' | 'advanced'
  goal: 'learn' | 'long_term_research' | 'trading_risk'
  horizon: 'short' | 'medium' | 'long'
  loss_tolerance: 'low' | 'medium' | 'high'
  loss_capacity: 'low' | 'medium' | 'high' | 'unknown'
  liquidity_need: 'soon' | 'flexible' | 'unknown'
  explanation: 'concise' | 'detailed'
  interests: ('defi' | 'infrastructure' | 'security' | 'payments' | 'stablecoins' | 'memecoins')[]
}
export type Argument = { title: string; detail: string; source_ids: string[]; interpretation: boolean }
export type CryptoAnalysisRequest = { asset_id: string; question: string; profile?: ResearchProfile }
export type MarketSnapshot = {
  price_usd: number | null
  change_24h_percent: number | null
  market_cap_usd: number | null
  fully_diluted_valuation_usd: number | null
  volume_24h_usd: number | null
  volume_scope: string | null
  circulating_supply: number | null
  max_supply: number | null
  high_24h_usd: number | null
  low_24h_usd: number | null
  ath_change_percent: number | null
  source: string | null
  source_url: string | null
  as_of: string | null
  retrieved_at: string | null
}
export type KeyPoint = { category: string; title: string; detail: string }
export type AnswerSection = {
  topic: string
  title: string
  answer: string
  status: 'answered' | 'limited' | 'unsupported'
  limitation: string | null
}
export type Risk = { title: string; detail: string; severity: string }
export type Source = {
  source_id?: string | null
  title: string
  url: string
  publisher: string | null
  published_at: string | null
  source_type: string
}
export type CryptoAnalysisResponse = {
  request_id: string
  asset: Asset
  answer: string
  submitted_question?: string
  answer_sections?: AnswerSection[]
  applied_profile?: ResearchProfile | null
  personalized_notes?: { title: string; detail: string }[]
  pros_cons?: { pros: Argument[]; cons: Argument[]; unknowns: Argument[] }
  analysis_mode: 'deterministic'
  market_snapshot: MarketSnapshot
  key_points: KeyPoint[]
  risks: Risk[]
  sources: Source[]
  meta: { generated_at: string; data_as_of: string | null; warnings: string[] }
}
export type Timeframe = '1d' | '1w' | '1m' | '1y'
export type HistoryPoint = { timestamp: string; price: number }
export type CryptoHistory = {
  asset_id: string
  timeframe: Timeframe
  currency: 'USD'
  source: string | null
  source_url: string | null
  sampling: string | null
  points: HistoryPoint[]
  warnings: string[]
  retrieved_at: string
  coverage_start: string | null
  coverage_end: string | null
  period_change_percent: number | null
  max_drawdown_percent: number | null
}
