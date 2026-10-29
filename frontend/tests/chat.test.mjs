import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { mount as mountSource } from './researchHarness.mjs'

const nativeRequire = createRequire(import.meta.url)
const config = { enabled: true, provider: 'gemini', model: 'configured-gemini-model', max_question_chars: 2000, profile_sharing: 'disabled_free_tier' }
const answer = { status: 'answered', answer: 'Research answer', citations: [], limitations: [], model: 'configured-gemini-model', profile_applied: false }
const asset = { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', category: 'crypto' }
const profile = { display_name: '', experience: 'beginner', goal: 'learn', horizon: 'long', loss_tolerance: 'low', loss_capacity: 'unknown', liquidity_need: 'unknown', explanation: 'concise', interests: [] }

function load(file, overrides = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports, require(name) {
      if (!name.startsWith('.')) return nativeRequire(name)
      const tsx = new URL(`${name}.tsx`, file)
      return load(existsSync(tsx) ? tsx : new URL(`${name}.ts`, file))
    },
    AbortController, DOMException, Headers, TypeError, Error, URL,
    window: { setTimeout, clearTimeout }, ...overrides,
  }, { filename: file.pathname })
  return module.exports
}

const apiFile = new URL('../src/lib/chatApi.ts', import.meta.url)
const componentFile = new URL('../src/components/CryptoChat.tsx', import.meta.url)
const loadApi = (overrides) => load(apiFile, overrides)
const ok = (value) => ({ ok: true, json: async () => value })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// As in the existing harness, compile real TSX without adding a DOM dependency.
// A small hook runner also exercises event handlers, effects, and stale completions.
function mount(props = {}, apiOverrides = {}) {
  const slots = [], pendingEffects = []
  let cursor = 0, tree
  const hooks = {
    ...React,
    useId: () => 'chat-test',
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const prior = slots[index]
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
        pendingEffects.push(() => {
          prior?.cleanup?.()
          slots[index] = { deps, cleanup: effect() }
        })
      }
    },
  }
  const calls = []
  const api = {
    ...loadApi(),
    getChatConfig: async () => config,
    sendChat: async (request, signal) => { calls.push({ request, signal }); return answer },
    ...apiOverrides,
  }
  const { CryptoChat, ChatReply } = load(componentFile, {
    require(name) {
      if (name === 'react') return hooks
       if (name === '../lib/chatApi') return api
       if (name === '../lib/profile') return load(new URL('../src/lib/profile.ts', import.meta.url))
       if (name === './ProfilePanel') return load(new URL('../src/components/ProfilePanel.tsx', import.meta.url))
      if (name === '../lib/links') return { safeExternalUrl(value) {
        try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
      } }
      return nativeRequire(name)
    },
  })
  function render(nextProps = props) {
    props = nextProps
    cursor = 0
    tree = CryptoChat(props)
    while (pendingEffects.length) pendingEffects.shift()()
    return renderToStaticMarkup(tree)
  }
  function nodes(node = tree) {
    if (!React.isValidElement(node)) return []
    return [node, ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child))]
  }
  const get = (predicate) => { const node = nodes().find(predicate); assert.ok(node, 'Expected rendered element'); return node }
  render()
  return {
    calls, render, ChatReply,
    async ready() { await new Promise((resolve) => setImmediate(resolve)); return render() },
    question(value) { get((node) => node.type === 'textarea').props.onChange({ target: { value } }); render() },
    check(index, value) { nodes().filter((node) => node.type === 'input')[index].props.onChange({ target: { checked: value } }); render() },
    click(label) { get((node) => node.type === 'button' && node.props.children === label).props.onClick(); render() },
    submit() { const result = get((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); render(); return result },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
}

test('configuration uses GET only and validates Gemini identity, nullable model and disabled sharing policy', async () => {
  const calls = []
  const api = loadApi({ fetch: async (url, init) => { calls.push({ url, init }); return ok({ ...config, model: null }) } })
  assert.equal((await api.getChatConfig()).model, null)
  assert.equal(calls[0].url, '/api/v1/chat/config')
  assert.equal(calls[0].init.method, undefined)
  assert.equal(calls[0].init.body, undefined)
  for (const fields of [{ provider: 'other' }, { provider: 'openai' }, { profile_sharing: 'automatic' }, { profile_sharing: 'requires_consent' }, { enabled: 'true' }, { model: 1 }, { max_question_chars: 0 }, { max_question_chars: 1999 }, { max_question_chars: 2001 }]) {
    await assert.rejects(loadApi({ fetch: async () => ok({ ...config, ...fields }) }).getChatConfig(), /unexpected configuration/)
  }
})

test('POST always strips supplied profile and unknown fields, even with stale sharing opt-in', async () => {
  const calls = []
  const api = loadApi({ fetch: async (url, init) => { calls.push({ url, init }); return ok(answer) } })
  await api.sendChat({ question: ' What is staking? ', share_profile: false, profile, messages: [], draft_asset: asset })
  assert.equal(calls[0].url, '/api/v1/chat')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { question: 'What is staking?', share_profile: false, messages: [] })
  await api.sendChat({ question: 'Risks?', asset_id: ' bitcoin ', share_profile: true, profile, messages: [{ role: 'user', content: 'Earlier' }] })
  assert.deepEqual(JSON.parse(calls[1].init.body), { question: 'Risks?', asset_id: 'bitcoin', share_profile: false, messages: [{ role: 'user', content: 'Earlier' }] })
  for (const staleProfile of [null, { display_name: 'PRIVATE', interests: ['confidential'] }, 'invalid legacy profile']) {
    const request = { question: 'Crypto risks?', share_profile: true, profile: staleProfile, messages: [] }
    await api.sendChat(request)
    const body = JSON.parse(calls.at(-1).init.body)
    assert.equal(body.share_profile, false)
    assert.ok(!Object.hasOwn(body, 'profile'))
    assert.equal(request.share_profile, true, 'Sanitization must not mutate the caller')
    assert.equal(request.profile, staleProfile)
  }
})

test('question limit and prior-message role/count validation happen before fetch', async () => {
  let calls = 0
  const api = loadApi({ fetch: async () => { calls++; return ok(answer) } })
  const base = { share_profile: false, messages: [] }
  for (const question of ['', '   ', 'a'.repeat(2001)]) await assert.rejects(api.sendChat({ ...base, question }), /1 to 2000/)
  for (const messages of [Array(13).fill({ role: 'user', content: 'x' }), [{ role: 'system', content: 'x' }], [{ role: 'assistant', content: null }]]) {
    await assert.rejects(api.sendChat({ ...base, question: 'x', messages }), /12 prior/)
  }
  assert.equal(calls, 0)
  await api.sendChat({ ...base, question: 'a'.repeat(2000) })
  assert.equal(calls, 1)
})

test('history is capped at 12 prior messages and excludes unavailable attempts', () => {
  const api = loadApi()
  const turns = Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, response: { ...answer, answer: `a${i}` } }))
  turns.push({ question: 'failed', response: { ...answer, status: 'unavailable' } })
  const messages = api.priorChatMessages(turns)
  assert.equal(messages.length, 12)
  assert.equal(messages[0].content, 'q3')
  assert.equal(messages[11].content, 'a8')
  assert.ok(messages.every((message, index) => message.role === (index % 2 ? 'assistant' : 'user')))
})

test('history filters asset switches, profile revocation and profile changes using normalized snapshots', () => {
  const api = loadApi()
  const turn = (question, assetLabel, submittedProfile) => ({ question, response: answer, assetLabel, profileShared: !!submittedProfile, submittedProfile })
  const turns = [
    turn('No context', null), turn('Bitcoin only', 'Bitcoin - bitcoin'), turn('Ethereum only', 'Ethereum - ethereum'),
    turn('Original profile', null, profile), turn('Different profile', null, { ...profile, loss_capacity: 'high' }),
    turn('Both contexts', 'Bitcoin - bitcoin', profile),
    { ...turn('Missing snapshot', null, profile), submittedProfile: undefined },
    { ...turn('Inconsistent consent', null), submittedProfile: profile },
  ]
  const questions = (context) => Array.from(api.priorChatMessages(turns, context), (message) => message.content).filter((_value, index) => index % 2 === 0)
  assert.deepEqual(questions({ assetLabel: null }), ['No context'])
  assert.deepEqual(questions({ assetLabel: 'Bitcoin - bitcoin' }), ['Bitcoin only'])
  assert.deepEqual(questions({ assetLabel: 'Ethereum - ethereum' }), ['Ethereum only'])
  assert.deepEqual(questions({ assetLabel: null, profile }), ['Original profile'])
  assert.deepEqual(questions({ assetLabel: null, profile: { ...profile, loss_capacity: 'high' } }), ['Different profile'])
  assert.deepEqual(questions({ assetLabel: 'Bitcoin - bitcoin', profile }), ['Both contexts'])
  const normalized = [turn('Normalized interests', null, { ...profile, display_name: ' Learner ', interests: ['security', 'defi', 'security'] })]
  assert.equal(api.priorChatMessages(normalized, { assetLabel: null, profile: { ...profile, display_name: 'Learner', interests: ['defi', 'security'] } }).length, 2)
  assert.equal(turns.length, 8, 'Filtering must not mutate displayed history')
})

test('history budgets skip whole oversized or blank turns and keep recent complete pairs without truncation', () => {
  const api = loadApi()
  const turn = (question, text) => ({ question, response: { ...answer, answer: text }, assetLabel: null, profileShared: false })
  const turns = [turn('small older question', 'small older answer'), turn('a'.repeat(4000), 'b'.repeat(4000)), turn('c'.repeat(4000), 'd'.repeat(4000)), turn('Oversized answer', 'x'.repeat(4001)), turn(' '.repeat(5), 'Blank question'), turn('Blank answer', '  ')]
  const messages = api.priorChatMessages(turns, { assetLabel: null })
  assert.deepEqual(Array.from(messages, (message) => message.content), ['small older question', 'small older answer', 'c'.repeat(4000), 'd'.repeat(4000)])
  assert.ok(messages.every((message, index) => message.role === (index % 2 ? 'assistant' : 'user')))
  assert.equal(api.priorChatMessages(turns.slice(1, 3), undefined, 0).length, 4, 'An empty current question can use the full history budget')
  assert.equal(api.priorChatMessages(turns.slice(1, 3), undefined, 1).length, 2, 'Even one current character must fit the total budget')
  assert.equal(api.priorChatMessages([turn('x'.repeat(4001), 'valid')]).length, 0)
  assert.equal(api.priorChatMessages([turn('valid', '')]).length, 0)
  const boundary = [turn('a'.repeat(4000), 'b'.repeat(4000)), turn('c'.repeat(3000), 'd'.repeat(3000))]
  assert.equal(api.priorChatMessages(boundary).length, 4, 'Default reserves the full 2000-character question')
  assert.equal(api.priorChatMessages([...boundary, turn('z', 'z')]).length, 4)
})

test('sendChat rejects blank or overlength prior messages and aggregate overflow before fetch', async () => {
  let calls = 0
  const api = loadApi({ fetch: async () => { calls++; return ok(answer) } })
  const request = { question: 'x', share_profile: false, messages: [] }
  for (const content of ['', '   ', 'a'.repeat(4001)]) {
    await assert.rejects(api.sendChat({ ...request, messages: [{ role: 'assistant', content }] }), /1 to 4000 nonblank/)
  }
  const messages = Array.from({ length: 4 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(4000) }))
  await assert.rejects(api.sendChat({ ...request, messages }), /at most 16000/)
  assert.equal(calls, 0)
  messages[0].content = 'x'.repeat(3999)
  await api.sendChat({ ...request, messages })
  assert.equal(calls, 1, 'Exact 16000-character boundary is valid')
})

test('semantic statuses are preserved and malformed answers rejected', async () => {
  const request = { question: 'question', messages: [], share_profile: false }
  for (const status of ['answered', 'out_of_scope', 'unavailable']) {
    const result = await loadApi({ fetch: async () => ok({ ...answer, status, model: null }) }).sendChat(request)
    assert.equal(result.status, status)
  }
  for (const fields of [{ status: 'guessed' }, { answer: null }, { answer: '' }, { answer: '   ' }, { answer: 'x'.repeat(8001) }, { citations: [{}] }, { limitations: [1] }, { model: undefined }, { profile_applied: 'yes' }]) {
    await assert.rejects(loadApi({ fetch: async () => ok({ ...answer, ...fields }) }).sendChat(request), /unexpected answer/)
  }
  for (const length of [4000, 4001, 8000]) {
    assert.equal((await loadApi({ fetch: async () => ok({ ...answer, answer: 'x'.repeat(length) }) }).sendChat(request)).answer.length, length)
  }
})

test('profile_applied true is a privacy contract violation for every response status with no fallback request', async () => {
  for (const status of ['answered', 'out_of_scope', 'unavailable']) {
    const calls = []
    const api = loadApi({ fetch: async (url) => { calls.push(url); return ok({ ...answer, status, profile_applied: true }) } })
    await assert.rejects(api.sendChat({ question: 'Crypto question', messages: [], share_profile: false }), /unexpected answer/)
    assert.deepEqual(calls, ['/api/v1/chat'])
  }
})

test('privacy contract violations preserve the draft and never display or resend the rejected answer', async () => {
  const calls = []
  const api = loadApi({ fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return ok(calls.length === 1 ? { ...answer, answer: 'PRIVATE RESPONSE', profile_applied: true } : answer)
  } })
  const app = mount({ profile }, { sendChat: api.sendChat })
  await app.ready()
  app.question('Public question')
  await app.submit()
  const html = app.render()
  assert.match(html, /unexpected answer/)
  assert.match(html, />Public question<\/textarea>/)
  assert.doesNotMatch(html, /PRIVATE RESPONSE/)
  assert.match(html, /prior messages to resend: 0/)
  await app.submit()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].body.messages, [])
  assert.ok(calls.every(({ url, body }) => url === '/api/v1/chat' && body.share_profile === false && !Object.hasOwn(body, 'profile')))
  app.unmount()
})

test('free quota HTTP errors surface without a billed or alternate provider retry', async () => {
  const calls = []
  const api = loadApi({ fetch: async (url) => {
    calls.push(url)
    return { ok: false, status: 429, json: async () => ({ detail: 'Gemini free quota exhausted. Try again later.' }) }
  } })
  await assert.rejects(api.sendChat({ question: 'Crypto risks?', messages: [], share_profile: true, profile }), /Gemini free quota exhausted/)
  assert.deepEqual(calls, ['/api/v1/chat'])
})

test('a 4001-character response is accepted and displayed, but its complete history pair is not resent', async () => {
  const longAnswer = 'L'.repeat(4001)
  const calls = []
  const api = loadApi({ fetch: async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return ok({ ...answer, answer: calls.length === 1 ? longAnswer : 'Short followup answer' })
  } })
  const app = mount({}, { sendChat: api.sendChat })
  await app.ready()
  app.question('Detailed crypto explanation')
  await app.submit()
  const html = app.render()
  assert.ok(html.includes(longAnswer), 'The full accepted response must remain displayed without truncation')
  assert.match(html, /prior messages to resend: 0/)
  app.question('Followup question')
  await app.submit()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].messages.length, 0, 'Do not resend either half of the oversized turn')
  assert.ok(app.render().includes(longAnswer), 'Skipping a turn in requests must not remove it from the display')
  app.unmount()
})

test('chat timeout is 60 seconds, aborts fetch and clears its timer', async () => {
  let fire, duration, cleared = false
  const api = loadApi({
    window: { setTimeout(callback, ms) { fire = callback; duration = ms; return 1 }, clearTimeout() { cleared = true } },
    fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))),
  })
  const request = api.sendChat({ question: 'risks?', messages: [], share_profile: false })
  assert.equal(duration, 60_000)
  fire()
  await assert.rejects(request, /longer than 60 seconds/)
  assert.equal(cleared, true)
})

test('caller cancellation, HTTP, malformed JSON and network failures are actionable', async () => {
  const controller = new AbortController()
  const api = loadApi({ fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))) })
  const pending = api.getChatConfig(controller.signal)
  controller.abort()
  await assert.rejects(pending, (error) => error.name === 'AbortError')
  for (const [fetch, expected] of [
    [async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Set up Gemini' }) }), /Set up Gemini/],
    [async () => ({ ok: false, status: 502, json: async () => null }), /HTTP 502/],
    [async () => ok(null), /invalid JSON/],
    [async () => { throw new TypeError('network') }, /backend is running/],
  ]) await assert.rejects(loadApi({ fetch }).getChatConfig(), expected)
})

test('rendered standalone card discloses Gemini privacy and operator requirements and submits without context', async () => {
  const app = mount()
  const html = await app.ready()
  assert.match(html, /Gemini free-tier chat/)
  assert.match(html, /Your saved research profile is not sent to Gemini free chat\. Do not include personal, financial, confidential information in questions\./)
  assert.match(html, /unpaid content may be used to improve Google products and may be human reviewed; regional terms differ/)
  assert.match(html, /href="https:\/\/ai.google.dev\/gemini-api\/terms" target="_blank" rel="noopener noreferrer"/)
  assert.match(html, /Free quota limits apply, with no billed or OpenAI fallback/)
  assert.match(html, /operator must keep provider billing disabled and confirm free-tier use/)
  assert.match(html, /client cannot verify or guarantee provider billing settings/)
  assert.doesNotMatch(html, /I consent to share|Preview profile|Actual profile|Hosted OpenAI/)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 1, 'Only completed asset opt-in remains')
  assert.match(html, /aria-describedby="chat-test-privacy chat-test-count chat-test-error"/)
  assert.match(html, /Chat is available independently/)
  assert.match(html, /not browser storage/)
  assert.match(html, /maxLength="2000"/)
  assert.doesNotMatch(html, /checked=""/)
  assert.match(html, /does not test the live model/)
  app.question('What is staking?')
  await app.submit()
  assert.equal(app.calls.length, 1)
  assert.equal(app.calls[0].request.asset_id, undefined)
  assert.equal(app.calls[0].request.profile, undefined)
  assert.equal(app.calls[0].request.share_profile, false)
  assert.match(app.render(), /Research answer/)
  app.unmount()
})

test('rendered asset opt-in remains independent of local profile and resets on completed asset changes', async () => {
  const app = mount({ completedAsset: asset, profile })
  assert.match(await app.ready(), /Bitcoin \(BTC\) - ID: bitcoin/)
  app.check(0, true)
  app.question('Context question')
  await app.submit()
  assert.equal(app.calls[0].request.asset_id, 'bitcoin')
  assert.equal(app.calls[0].request.profile, undefined)
  app.render()
  app.check(0, false)
  app.question('No asset question')
  await app.submit()
  assert.equal(app.calls[1].request.asset_id, undefined)
  assert.equal(app.calls[1].request.profile, undefined)
  assert.equal(app.calls[1].request.share_profile, false)
  assert.equal(app.calls[1].request.messages.length, 0)
  app.render()
  assert.doesNotMatch(app.render({ completedAsset: asset, profile: { ...profile, display_name: 'PRIVATE draft' } }), /PRIVATE draft|Profile submitted|Preview profile|I consent to share/)
  app.check(0, true)
  app.render({ completedAsset: { ...asset, id: 'ethereum', name: 'Ethereum', symbol: 'eth' }, profile })
  app.render()
  app.question('Different completed asset')
  await app.submit()
  assert.equal(app.calls[2].request.asset_id, undefined)
  app.unmount()
})

test('local profile edits do not share data or change public chat history compatibility', async () => {
  const calls = []
  const app = mount({ profile }, { async sendChat(request) {
    calls.push(request)
    return { ...answer, answer: `Reply to ${request.question}` }
  } })
  await app.ready()
  app.question('Public baseline')
  await app.submit(); app.render()
  app.question('Public followup')
  await app.submit(); app.render()
  assert.equal(calls[1].messages.length, 2)
  app.question('Another public question')
  await app.submit(); app.render()
  assert.deepEqual(Array.from(calls[2].messages, (message) => message.content), ['Public baseline', 'Reply to Public baseline', 'Public followup', 'Reply to Public followup'])
  const html = app.render({ profile: { ...profile, display_name: 'PRIVATE name', loss_capacity: 'high' } })
  assert.match(html, /Next request context: asset: None; profile: Not shared; prior messages to resend: 6/)
  assert.doesNotMatch(html, /PRIVATE name|Actual profile|Preview profile|I consent to share/)
  app.question('After local edit')
  await app.submit(); app.render()
  assert.equal(calls[3].messages.length, 6)
  assert.ok(calls.every((request) => request.share_profile === false && !Object.hasOwn(request, 'profile')))
  assert.match(html, /History context filtering applies to future requests only/)
  assert.match(html, /cannot delete data already sent to the hosted provider/)
  assert.match(html, /Previously shared profile turns are excluded/)
  assert.match(html, /Reply to Public baseline/)
  app.unmount()
})

test('local profile reset and edits still propagate through App but never enable Gemini profile sharing', async () => {
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  const dashboard = mountSource('App.tsx', 'default', {}, {}, {
    './App.css': {}, './lib/cryptoApi': { getAssets: async () => [], analyzeCrypto: async () => { throw new Error('Not used') } },
  })
  const formProps = () => dashboard.get((node) => node.type?.name === 'AnalysisForm').props
  const chatProps = () => dashboard.get((node) => node.type?.name === 'CryptoChat').props
  const form = mountSource('components/AnalysisForm.tsx', 'AnalysisForm', formProps(), { window: { localStorage, setTimeout, clearTimeout } })
  const panel = () => form.get((node) => node.type?.name === 'ProfilePanel')
  dashboard.render()
  assert.deepEqual(JSON.parse(JSON.stringify(chatProps().profile)), profile)
  const app = mount(chatProps())
  await app.ready()
  app.question('Public question before reset')
  await app.submit(); app.render()
  assert.equal(app.calls[0].request.share_profile, false)
  assert.equal(app.calls[0].request.profile, undefined)
  const beforeReset = chatProps().profileResetGeneration
  panel().props.onReset()
  form.render(); dashboard.render()
  assert.equal(chatProps().profileResetGeneration, beforeReset + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(chatProps().profile)), profile, 'Reset still publishes default preferences for local research')
  const resetHtml = app.render(chatProps())
  assert.match(resetHtml, /profile: Not shared; prior messages to resend: 2/)
  assert.match(resetHtml, /Public question before reset/)
  assert.doesNotMatch(resetHtml, /checked=""/)
  app.question('After explicit reset')
  await app.submit()
  assert.equal(app.calls[1].request.share_profile, false)
  assert.equal(app.calls[1].request.profile, undefined)
  assert.equal(app.calls[1].request.messages.length, 2)
  panel().props.onChange({ ...profile, display_name: 'Edited preference' })
  form.render(); dashboard.render(); app.render(chatProps())
  assert.equal(chatProps().profileResetGeneration, beforeReset + 1, 'An ordinary profile edit must not signal reset')
  assert.equal(chatProps().profile.display_name, 'Edited preference', 'Local profile remains editable')
  app.question('Question after local profile edit')
  await app.submit()
  assert.equal(app.calls[2].request.share_profile, false)
  assert.equal(app.calls[2].request.profile, undefined)
  assert.equal(app.calls[2].request.messages.length, 4)
  assert.match(app.render(), /Public question before reset/)
  assert.doesNotMatch(app.render(), /Edited preference|I consent to share|Preview profile/)
  app.unmount(); form.unmount(); dashboard.unmount()
})

test('rendered chat asset switches and context opt-out stop resending previous asset answers', async () => {
  const app = mount({ completedAsset: asset })
  await app.ready()
  app.check(0, true)
  assert.match(app.render(), /Next request context: asset: Bitcoin \(BTC\) - bitcoin; profile: Not shared/)
  app.question('Bitcoin question')
  await app.submit(); app.render()
  app.question('Bitcoin followup')
  await app.submit(); app.render()
  assert.equal(app.calls[1].request.messages.length, 2)
  app.check(0, false)
  assert.match(app.render(), /asset: None; profile: Not shared; prior messages to resend: 0/)
  app.question('No asset question')
  await app.submit(); app.render()
  assert.equal(app.calls[2].request.messages.length, 0)
  const ethereum = { ...asset, id: 'ethereum', name: 'Ethereum', symbol: 'eth' }
  app.render({ completedAsset: ethereum }); app.render()
  app.check(0, true)
  assert.match(app.render(), /Next request context: asset: Ethereum \(ETH\) - ethereum; profile: Not shared; prior messages to resend: 0/)
  app.question('Ethereum question')
  await app.submit()
  assert.equal(app.calls[3].request.asset_id, 'ethereum')
  assert.equal(app.calls[3].request.messages.length, 0)
  assert.match(app.render(), /Bitcoin question/)
  assert.match(app.render(), /No asset question/)
  app.unmount()
})

test('disabled config gives setup instructions and retry only checks config', async () => {
  let configCalls = 0
  const app = mount({}, { getChatConfig: async () => { configCalls++; return { ...config, enabled: false, model: null } } })
  const html = await app.ready()
  assert.match(html, /Not configured/)
  assert.match(html, /server-side GEMINI_API_KEY and model/)
  assert.match(html, /confirm free-tier use with provider billing disabled/)
  assert.match(html, /Never enter an API key here/)
  assert.doesNotMatch(html, /type="password"|name="api_key"/)
  app.question('question')
  await app.submit()
  assert.equal(app.calls.length, 0)
  app.click('Retry configuration')
  await app.ready()
  assert.equal(configCalls, 2)
  assert.equal(app.calls.length, 0)
  app.unmount()
})

test('config errors recover on retry and unmounted config responses are aborted', async () => {
  let attempt = 0
  const app = mount({}, { getChatConfig: async () => {
    if (++attempt === 1) throw new Error('Cannot reach the chat service. Check backend setup.')
    return config
  } })
  assert.match(await app.ready(), /Check backend setup/)
  app.click('Retry configuration')
  assert.match(await app.ready(), /chat: Enabled/)
  assert.equal(app.calls.length, 0)
  app.unmount()
  const pending = deferred()
  let signal
  const unmounted = mount({}, { getChatConfig(value) { signal = value; return pending.promise } })
  unmounted.unmount()
  assert.equal(signal.aborted, true)
  pending.resolve(config)
  await pending.promise
})

test('unavailable and transport failures preserve the draft and do not enter prior-message history', async () => {
  let attempt = 0
  const calls = []
  const app = mount({}, { async sendChat(request) {
    calls.push(request)
    if (++attempt === 1) return { ...answer, status: 'unavailable', answer: 'Provider unavailable' }
    if (attempt === 2) throw new Error('Temporary connection failure')
    return { ...answer, status: 'out_of_scope', answer: 'Please ask about crypto' }
  } })
  await app.ready()
  app.question('A question')
  await app.submit()
  assert.match(app.render(), /Chat unavailable/)
  assert.match(app.render(), />A question<\/textarea>/)
  await app.submit()
  assert.match(app.render(), /Temporary connection failure/)
  assert.match(app.render(), />A question<\/textarea>/)
  await app.submit()
  assert.match(app.render(), /Out of scope/)
  assert.doesNotMatch(app.render(), />A question<\/textarea>/)
  assert.ok(calls.every((request) => request.messages.length === 0))
  app.click('Clear history')
  assert.doesNotMatch(app.render(), /Provider unavailable|Please ask about crypto/)
  app.unmount()
})

test('cancel, clear and unmount abort pending requests and ignore even transport-ignoring stale responses', async () => {
  for (const action of ['Cancel request', 'Clear history', 'unmount']) {
    const old = deferred(), newer = deferred(), calls = []
    const app = mount({ completedAsset: asset, profile }, { sendChat(request, signal) { calls.push({ request, signal }); return calls.length === 1 ? old.promise : newer.promise } })
    await app.ready()
    app.check(0, true)
    app.question('old question')
    const first = app.submit()
    assert.match(app.render(), /Cancel request/)
    if (action === 'unmount') app.unmount()
    else app.click(action)
    assert.equal(calls[0].signal.aborted, true)
    if (action !== 'unmount') {
      app.question('new question')
      const second = app.submit()
      old.resolve({ ...answer, answer: 'STALE ANSWER' })
      await first
      assert.doesNotMatch(app.render(), /STALE ANSWER/)
      assert.match(app.render(), /Waiting for Gemini/)
      newer.resolve({ ...answer, answer: 'NEW ANSWER' })
      await second
      const html = app.render()
      assert.match(html, /NEW ANSWER/)
      assert.doesNotMatch(html, /STALE ANSWER/)
      if (action === 'Clear history') {
        assert.equal(calls[1].request.share_profile, false)
        assert.equal(calls[1].request.asset_id, undefined)
        assert.equal(calls[1].request.messages.length, 0)
      }
      app.unmount()
    } else { old.resolve(answer); await first }
  }
})

test('rendered replies escape markup, show limitations, safe citations and distinct semantic statuses', () => {
  const app = mount()
  for (const [status, label] of [['answered', 'Answered'], ['out_of_scope', 'Out of scope'], ['unavailable', 'Chat unavailable']]) {
    const turn = {
      question: '<b>question</b>', assetLabel: null, profileShared: false,
      response: { ...answer, status, answer: '<script>alert(1)</script>', limitations: ['<img src=x>'], model: null,
        citations: [{ source_id: 's1', title: '<b>unsafe</b>', url: 'javascript:alert(1)' }, { source_id: 's2', title: 'Safe source', url: 'https://example.org/research' }] },
    }
    const html = renderToStaticMarkup(React.createElement(app.ChatReply, { turn }))
    assert.ok(html.includes(label))
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /&lt;b&gt;question&lt;\/b&gt;/)
    assert.match(html, /Limitations/)
    assert.match(html, /Source link unavailable/)
    assert.match(html, /href="https:\/\/example.org\/research" target="_blank" rel="noopener noreferrer"/)
    assert.doesNotMatch(html, /<script|<img|href="javascript/)
    assert.match(html, /Model: Not reported; profile applied: No/)
  }
  app.unmount()
})
