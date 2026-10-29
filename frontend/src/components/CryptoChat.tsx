import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CHAT_QUESTION_LIMIT, getChatConfig, priorChatMessages, sendChat } from '../lib/chatApi'
import { safeExternalUrl } from '../lib/links'
import type { Asset, ResearchProfile } from '../types/crypto'
import type { ChatConfig, ChatTurn } from '../types/chat'

export type CryptoChatProps = { completedAsset?: Asset | null; profile?: ResearchProfile; profileResetGeneration?: number }

export function ChatReply({ turn }: { turn: ChatTurn }) {
  const { response } = turn
  const statusLabel = response.status === 'answered' ? 'Answered'
    : response.status === 'out_of_scope' ? 'Out of scope' : 'Chat unavailable'
  return <article className={`chat-turn chat-turn--${response.status}`}>
    <div className="submitted-question">
      <h3>Your question</h3>
      <p>{turn.question}</p>
      <p className="meta-copy">Asset context: {turn.assetLabel ?? 'None'}; profile shared: {turn.profileShared ? 'Yes' : 'No'}.</p>
    </div>
    <div className="chat-reply">
      <h3 className="chat-status">{statusLabel}</h3>
      <p className="answer-text">{response.answer}</p>
      {response.status === 'out_of_scope' && <p className="form-help-text">Try a crypto research question. This scope decision comes from the chat service.</p>}
      {response.status === 'unavailable' && <p className="form-help-text">Retry configuration below. Ask the operator to check the server-side GEMINI_API_KEY, free-tier confirmation, configured model, and free quota availability. There is no billed or OpenAI fallback.</p>}
      {response.limitations.length > 0 && <div className="chat-limitations">
        <h4>Limitations</h4>
        <ul className="warning-list">{response.limitations.map((limitation, index) => <li className="warning-item" key={index}>{limitation}</li>)}</ul>
      </div>}
      {response.citations.length > 0 && <div className="chat-citations">
        <h4>Citations</h4>
        <ul className="source-list">{response.citations.map((citation, index) => {
          const url = safeExternalUrl(citation.url)
          return <li className="source-item" key={`${citation.source_id}-${index}`}>
            <span className="source-number">{citation.source_id}</span>
            <div>{url ? <a className="source-link" href={url} target="_blank" rel="noopener noreferrer">{citation.title}</a> : <span>{citation.title}</span>}
              {!url && <p className="source-meta">Source link unavailable (not a safe HTTP or HTTPS URL).</p>}
            </div>
          </li>
        })}</ul>
      </div>}
      <p className="meta-copy">Model: {response.model ?? 'Not reported'}; profile applied: {response.profile_applied ? 'Yes' : 'No'}.</p>
    </div>
  </article>
}

export function CryptoChat({ completedAsset = null }: CryptoChatProps) {
  const id = useId()
  const [config, setConfig] = useState<ChatConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [question, setQuestion] = useState('')
  const [assetConsentId, setAssetConsentId] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const headingId = `${id}-heading`
  const limit = Math.min(CHAT_QUESTION_LIMIT, config?.max_question_chars ?? CHAT_QUESTION_LIMIT)
  const assetEnabled = !!completedAsset && assetConsentId === completedAsset.id
  const available = !!config?.enabled && !configLoading && !configError
  const busy = pendingQuestion !== null
  const currentAssetLabel = assetEnabled && completedAsset
    ? `${completedAsset.name} (${completedAsset.symbol.toUpperCase()}) - ${completedAsset.id}` : null
  const currentMessages = priorChatMessages(turns, { assetLabel: currentAssetLabel }, question.trim().length)

  useEffect(() => {
    const controller = new AbortController()
    setConfigLoading(true)
    setConfigError(null)
    void getChatConfig(controller.signal).then((value) => {
      if (!controller.signal.aborted) setConfig(value)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setConfig(null)
        setConfigError(errorMessage(reason))
      }
    }).finally(() => {
      if (!controller.signal.aborted) setConfigLoading(false)
    })
    return () => controller.abort()
  }, [configAttempt])

  useEffect(() => () => {
    generation.current += 1
    requestRef.current?.abort()
  }, [])

  useEffect(() => { setAssetConsentId(null) }, [completedAsset?.id])

  function cancel() {
    generation.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    setPendingQuestion(null)
    setError('Request cancelled. No answer was added to history.')
  }

  function clearHistory() {
    cancel()
    setTurns([])
    setQuestion('')
    setAssetConsentId(null)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current || !available) return
    if (!question.trim() || question.length > limit) {
      setError(`Enter a question of 1 to ${limit} characters.`)
      return
    }
    const controller = new AbortController()
    const current = ++generation.current
    requestRef.current = controller
    const submitted = question.trim()
    const assetLabel = currentAssetLabel
    setPendingQuestion(submitted)
    setError(null)
    try {
      const response = await sendChat({
        question: submitted,
        ...(assetEnabled && completedAsset ? { asset_id: completedAsset.id } : {}),
        share_profile: false,
        messages: currentMessages,
      }, controller.signal)
      if (controller.signal.aborted || generation.current !== current) return
      setTurns((previous) => [...previous, { question: submitted, response, assetLabel, profileShared: false }])
      if (response.status !== 'unavailable') setQuestion('')
    } catch (reason: unknown) {
      if (!controller.signal.aborted && generation.current === current) setError(errorMessage(reason))
    } finally {
      if (generation.current === current) {
        requestRef.current = null
        setPendingQuestion(null)
      }
    }
  }

  return <section className="card card--chat" aria-labelledby={headingId}>
    <div className="card-header">
      <div><p className="section-label">Crypto conversation</p><h2 id={headingId}>Crypto chat</h2></div>
      <button className="text-button" type="button" onClick={clearHistory}>Clear history</button>
    </div>
    <div className="disclosure chat-disclosure">
      <p><strong>Gemini free-tier chat.</strong> Questions and up to 12 prior conversation messages are sent to the backend and Gemini. Completed asset context is optional and requires opt-in. Conversation history stays in this page's memory, not browser storage; clearing it does not delete data already sent to the provider. Research only, not financial advice.</p>
      <p>Gemini unpaid content may be used to improve Google products and may be human reviewed; regional terms differ. Read the <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">official Gemini API terms</a>.</p>
      <p>Free quota limits apply, with no billed or OpenAI fallback. The operator must keep provider billing disabled and confirm free-tier use. This client cannot verify or guarantee provider billing settings.</p>
    </div>
    <div className="chat-config" role="status" aria-live="polite">
      {configLoading ? <p className="meta-copy">Loading chat configuration...</p> : configError ? <p className="error-copy">{configError}</p> : <>
        <p className="meta-copy">Provider: Gemini; model: {config?.model ?? 'Not configured'}; chat: {config?.enabled ? 'Enabled' : 'Unavailable'}; profile sharing: Disabled for free tier.</p>
        {!config?.enabled && <p className="form-help-text">Ask the operator to configure the server-side GEMINI_API_KEY and model, confirm free-tier use with provider billing disabled, and enable chat, then retry configuration. Never enter an API key here.</p>}
      </>}
      <button className="text-button" type="button" disabled={configLoading || busy} onClick={() => setConfigAttempt((value) => value + 1)}>Retry configuration</button>
      <p className="form-help-text">This checks configuration only; it does not test the live model.</p>
    </div>
    <div className="chat-history" role="log" aria-label="Chat conversation" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
      {turns.length === 0 && <p className="empty-copy">Ask about crypto without selecting an asset or completing an analysis.</p>}
      {turns.map((turn, index) => <ChatReply key={index} turn={turn} />)}
      {pendingQuestion !== null && <div className="chat-pending"><p className="answer-text">{pendingQuestion}</p><p role="status">Waiting for Gemini (up to 60 seconds)...</p></div>}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <div className="chat-context">
        <p className="meta-copy">Completed asset: {completedAsset ? `${completedAsset.name} (${completedAsset.symbol.toUpperCase()}) - ID: ${completedAsset.id}` : 'None. Chat is available independently.'}</p>
        <label className="chat-checkbox"><input type="checkbox" checked={assetEnabled} disabled={!completedAsset || busy} onChange={(event) => setAssetConsentId(event.target.checked && completedAsset ? completedAsset.id : null)} /> Include this completed asset as context</label>
        <p id={`${id}-privacy`} className="form-help-text">Your saved research profile is not sent to Gemini free chat. Do not include personal, financial, confidential information in questions.</p>
        <p className="form-help-text">History context filtering applies to future requests only: only turns matching the current asset with no shared profile are resent. Previously shared profile turns are excluded. Other turns stay visible here; filtering or clearing history cannot delete data already sent to the hosted provider. Oversized turns are skipped as complete pairs, not truncated.</p>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor={`${id}-question`}>Your crypto question</label>
        <textarea id={`${id}-question`} className="form-input form-textarea" value={question} disabled={busy} maxLength={limit} aria-describedby={`${id}-privacy ${id}-count ${id}-error`} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I understand about crypto liquidity risks?" />
        <p id={`${id}-count`} className="form-help-text">{question.length}/{limit} characters</p>
      </div>
      <p id={`${id}-error`} className="error-copy" role="alert">{error}</p>
      <div className="chat-actions">
        <button className="primary-button" type="submit" disabled={!available || busy || !question.trim() || question.length > limit}>{busy ? 'Waiting for answer...' : 'Ask crypto chat'}</button>
        {busy && <button className="secondary-button" type="button" onClick={cancel}>Cancel request</button>}
      </div>
    </form>
    <footer className="chat-context" aria-label="Current chat request context">
      <p className="meta-copy" role="status">Next request context: asset: {currentAssetLabel ?? 'None'}; profile: Not shared; prior messages to resend: {currentMessages.length} (complete pairs, within the 16000-character question and history budget).</p>
    </footer>
  </section>
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Chat request failed. Please try again.'
}
