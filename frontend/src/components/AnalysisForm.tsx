import { useState } from 'react'
import type { FormEvent } from 'react'
import type { StockAnalysisRequest } from '../types/stockAnalysis'

type AnalysisFormProps = {
    onSubmit: (request: StockAnalysisRequest) => Promise<void>
    isLoading: boolean
}

export function AnalysisForm({ onSubmit, isLoading }: AnalysisFormProps) {
    const [ticker, setTicker] = useState('NVDA')
    const [question, setQuestion] = useState("What are this company's main growth drivers and risks? Include current momentum, valuation context, and major risks.")

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        await onSubmit({ ticker, question })
    }

    return (
        <form className="card analysis-form" onSubmit={handleSubmit}>
            <div className="card-header">
                <div>
                    <p className="section-label">Input</p>
                    <h2>Run an analysis</h2>
                </div>
                <span className="pill">Single-turn MVP</span>
            </div>

            <label className="form-field">
                <span className="form-label">Ticker</span>
                <input
                    className="form-input"
                    value={ticker}
                    onChange={(event) => setTicker(event.target.value.toUpperCase())}
                    placeholder="NVDA"
                    maxLength={10}
                />
            </label>

            <label className="form-field">
                <span className="form-label">Research question</span>
                <textarea
                    className="form-input form-textarea"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="What are this company's main growth drivers and risks? Include momentum, valuation, and recent market context."
                    rows={5}
                    maxLength={1000}
                />
            </label>

            <p className="form-help-text">
                Ask one rich question with multiple parts, for example: growth drivers, risks, valuation, and recent market context.
            </p>

            <button className="primary-button" type="submit" disabled={isLoading}>
                {isLoading ? 'Analyzing…' : 'Analyze'}
            </button>
        </form>
    )
}