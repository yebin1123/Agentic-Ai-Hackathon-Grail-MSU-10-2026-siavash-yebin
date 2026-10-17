import sampleStockAnalysis from '../mocks/sample-stock-analysis.json'
import type { ApiErrorResponse, StockAnalysisRequest, StockAnalysisResponse } from '../types/stockAnalysis'

const USE_MOCK_DATA = false
const sampleResponse = sampleStockAnalysis as StockAnalysisResponse

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function analyzeStock({ ticker, question }: StockAnalysisRequest): Promise<StockAnalysisResponse> {
  const normalizedTicker = ticker.trim().toUpperCase()
  const normalizedQuestion = question.trim()

  if (!normalizedTicker || !normalizedQuestion) {
    throw new Error('Please enter both a ticker and a research question.')
  }

  if (USE_MOCK_DATA) {
    await wait(850)

    return {
      ...sampleResponse,
      ticker: normalizedTicker,
      company_name: normalizedTicker === 'NVDA' ? 'NVIDIA Corporation' : sampleResponse.company_name,
      request_id: `mock_${normalizedTicker.toLowerCase()}_${Date.now()}`,
      meta: {
        ...sampleResponse.meta,
        generated_at: new Date().toISOString(),
      },
    }
  }

  const response = await fetch('/api/v1/stock-analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticker: normalizedTicker,
      question: normalizedQuestion,
    }),
  })

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as ApiErrorResponse | null
    throw new Error(errorPayload?.error?.message ?? 'The analysis request failed.')
  }

  return (await response.json()) as StockAnalysisResponse
}