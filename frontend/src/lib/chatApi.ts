import type { ChatConfig, ChatMessage, ChatRequest, ChatResponse, ChatTurn } from '../types/chat'
import { normalizeProfile, profilesEqual } from './profile'
import type { ResearchProfile } from '../types/crypto'

export const CHAT_QUESTION_LIMIT = 2000
export const CHAT_HISTORY_LIMIT = 12
export const CHAT_MESSAGE_LIMIT = 4000
export const CHAT_ANSWER_LIMIT = 8000
export const CHAT_TOTAL_LIMIT = 16_000
export const CHAT_TIMEOUT_MS = 60_000

async function chatJson(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, CHAT_TIMEOUT_MS)
  try {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    const response = await fetch(path, { ...init, headers, signal: controller.signal })
    const payload: unknown = await response.json().catch(() => null)
    if (signal?.aborted) throw new DOMException('Chat request cancelled.', 'AbortError')
    if (timedOut) throw new Error('Chat took longer than 60 seconds. Please try again.')
    if (!response.ok) {
      const body = isRecord(payload) ? payload : {}
      const detail = (isRecord(body.error) ? body.error.message : undefined) ?? body.detail ?? body.message
      throw new Error(typeof detail === 'string' && detail.trim()
        ? detail : `The chat service returned HTTP ${response.status}. Please try again.`)
    }
    if (!isRecord(payload)) throw new Error('The chat service returned invalid JSON. Please try again.')
    return payload
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Chat request cancelled.', 'AbortError')
    if (timedOut) throw new Error('Chat took longer than 60 seconds. Please try again.')
    if (error instanceof TypeError) throw new Error('Cannot reach the chat service. Check your connection and that the backend is running.')
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function getChatConfig(signal?: AbortSignal): Promise<ChatConfig> {
  const value = await chatJson('/api/v1/chat/config', {}, signal)
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || value.provider !== 'gemini' ||
      !nullableString(value.model) || value.max_question_chars !== CHAT_QUESTION_LIMIT ||
      value.profile_sharing !== 'disabled_free_tier') {
    throw new Error('The chat service returned an unexpected configuration. Retry configuration or check backend setup.')
  }
  return value as ChatConfig
}

export type ChatContext = { assetLabel: string | null; profile?: ResearchProfile }

export function priorChatMessages(turns: ChatTurn[], context?: ChatContext, questionLength = CHAT_QUESTION_LIMIT): ChatMessage[] {
  const currentProfile = context?.profile ? normalizeProfile(context.profile) : undefined
  const reserve = Number.isInteger(questionLength) && questionLength >= 0 && questionLength <= CHAT_QUESTION_LIMIT
    ? questionLength : CHAT_QUESTION_LIMIT
  let remaining = CHAT_TOTAL_LIMIT - reserve
  const messages: ChatMessage[] = []
  for (let index = turns.length - 1; index >= 0 && messages.length < CHAT_HISTORY_LIMIT; index -= 1) {
    const turn = turns[index]
    if (turn.response.status === 'unavailable') continue
    if (context && (turn.assetLabel !== context.assetLabel || (currentProfile
      ? turn.profileShared !== true || !turn.submittedProfile || !profilesEqual(turn.submittedProfile, currentProfile)
      : turn.profileShared !== false || turn.submittedProfile != null))) continue
    if (!validMessageContent(turn.question) || !validMessageContent(turn.response.answer)) continue
    const size = turn.question.length + turn.response.answer.length
    if (size > remaining) continue
    // Keep the most recent compatible complete pairs without truncating either message.
    messages.unshift({ role: 'user', content: turn.question }, { role: 'assistant', content: turn.response.answer })
    remaining -= size
  }
  return messages
}

export async function sendChat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const question = request.question.trim()
  if (!question || request.question.length > CHAT_QUESTION_LIMIT) {
    throw new Error('Enter a question of 1 to 2000 characters.')
  }
  if (!Array.isArray(request.messages) || request.messages.length > CHAT_HISTORY_LIMIT ||
      request.messages.some((message) => !message || !['user', 'assistant'].includes(message.role) || !validMessageContent(message.content))) {
    throw new Error('Chat history must contain at most 12 prior user or assistant messages, each with 1 to 4000 nonblank characters.')
  }
  if (question.length + request.messages.reduce((total, message) => total + message.content.length, 0) > CHAT_TOTAL_LIMIT) {
    throw new Error('Chat history and question must total at most 16000 characters. Clear history or shorten the question.')
  }
  const body: ChatRequest = {
    question,
    share_profile: false,
    messages: request.messages.map(({ role, content }) => ({ role, content })),
  }
  if (request.asset_id?.trim()) body.asset_id = request.asset_id.trim()
  const value = await chatJson('/api/v1/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, signal)
  if (!isRecord(value) || !['answered', 'out_of_scope', 'unavailable'].includes(value.status as string) ||
      !validMessageContent(value.answer, CHAT_ANSWER_LIMIT) || !nullableString(value.model) || value.profile_applied !== false ||
      !Array.isArray(value.limitations) || value.limitations.some((item) => typeof item !== 'string') ||
      !Array.isArray(value.citations) || value.citations.some((item) => !isRecord(item) ||
        !['source_id', 'title', 'url'].every((key) => typeof item[key] === 'string'))) {
    throw new Error('The chat service returned an unexpected answer. Please try again.')
  }
  return value as ChatResponse
}

function validMessageContent(value: unknown, limit = CHAT_MESSAGE_LIMIT): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}
