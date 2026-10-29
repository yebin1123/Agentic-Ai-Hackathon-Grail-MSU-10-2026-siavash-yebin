import type { CryptoAnalysisRequest, CryptoAnalysisResponse } from '../types/crypto'
import { KeyPointsList } from './KeyPointsList'

type Props = {
  request: CryptoAnalysisRequest
  response: CryptoAnalysisResponse
}

const evidenceLabels = {
  answered: 'Snapshot evidence',
  limited: 'Partial evidence',
  unsupported: 'Not connected',
}

export function ResearchAnswer({ request, response }: Props) {
  const sections = response.answer_sections
  const hasSections = !!sections?.length
  // The local completed request is authoritative, even if the service echoes a different question.
  const question = response.submitted_question?.trim() === request.question.trim()
    ? response.submitted_question.trim() : request.question

  return <>
    <article className="card card--answer" aria-labelledby="research-answer-title">
      <div className="card-header"><div><p className="section-label">Your answer / {response.asset.symbol.toUpperCase()}</p><h2 id="research-answer-title">{response.asset.name}<span className="asset-category">{response.asset.category.replaceAll('_', ' ')}</span></h2></div></div>
      <div className="submitted-question"><h3>Submitted question</h3><p>{question}</p></div>
      {hasSections ? <div className="answer-sections">
        {sections.map((section, index) => <section className={`answer-section answer-section--${section.status}`} key={`${index}-${section.topic}`} aria-labelledby={`answer-topic-${index}`}>
          <div className="answer-section-header"><h3 id={`answer-topic-${index}`}>{section.title || section.topic.replaceAll('_', ' ')}</h3><span className={`evidence-badge evidence-badge--${section.status}`}>{evidenceLabels[section.status]}</span></div>
          <p className="answer-text">{section.answer || 'No answer was included for this topic.'}</p>
          {section.limitation && <p className="answer-limitation"><strong>Limit:</strong> {section.limitation}</p>}
        </section>)}
      </div> : <>
        <p className="coverage-notice">This response has no topic-by-topic sections. The overview below may not answer every part of your question; topic-level evidence coverage is unavailable.</p>
        <p className="answer-text">{response.answer || 'The service did not include an overview answer.'}</p>
      </>}
      <p className="request-id">Request ID: {response.request_id}</p>
    </article>
    {!hasSections && <KeyPointsList keyPoints={response.key_points} />}
  </>
}
