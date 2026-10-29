import type { ResearchProfile } from './crypto'

export type ChatConfig = {
  enabled: boolean
  provider: 'gemini'
  model: string | null
  max_question_chars: number
  profile_sharing: 'disabled_free_tier'
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ChatRequest = {
  question: string
  asset_id?: string | null
  profile?: ResearchProfile | null
  share_profile: boolean
  messages: ChatMessage[]
}
export type ChatCitation = { source_id: string; title: string; url: string }
export type ChatResponse = {
  status: 'answered' | 'out_of_scope' | 'unavailable'
  answer: string
  citations: ChatCitation[]
  limitations: string[]
  model: string | null
  profile_applied: boolean
}
export type ChatTurn = {
  question: string
  response: ChatResponse
  assetLabel: string | null
  profileShared: boolean
  submittedProfile?: ResearchProfile
}
