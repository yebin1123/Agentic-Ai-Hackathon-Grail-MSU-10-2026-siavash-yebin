export type StockAnalysisRequest = {
  ticker: string
  question: string
}

export type MarketSnapshot = {
  price: number | null
  currency: string | null
  change_percent: number | null
  as_of: string | null
  source: string | null
  market_cap_usd?: number | null
  volume_24h_usd?: number | null
  volatility_24h?: number | null
  asset_type?: string | null
  history?: Array<{
    timestamp: string
    close: number
  }>
}

export type KeyPoint = {
  category: string
  title: string
  detail: string
}

export type Risk = {
  title: string
  detail: string
  severity: 'low' | 'medium' | 'high' | 'unknown'
}

export type Source = {
  title: string
  url: string
  publisher: string | null
  published_at: string | null
  source_type: string
}

export type StockAnalysisResponse = {
  request_id: string
  ticker: string
  company_name: string | null
  answer: string
  market_snapshot: MarketSnapshot | null
  key_points: KeyPoint[]
  risks: Risk[]
  sources: Source[]
  meta: {
    generated_at: string
    data_as_of: string | null
    warnings: string[]
  }
}

export type ApiErrorResponse = {
  error: {
    code: string
    message: string
    request_id?: string
  }
}