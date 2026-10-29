import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { deferred, loadSource, mount, settled } from './researchHarness.mjs'

const profileApi = loadSource('lib/profile.ts')
const defaults = JSON.parse(JSON.stringify(profileApi.defaultProfile()))
const asset = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', category: 'crypto' }
const candidate = { id: 'other-bitcoin', symbol: 'btc', name: 'Different Bitcoin', category: 'crypto', platforms: { ethereum: '0x123' }, provider_url: 'https://example.org/asset' }
const response = { asset, request_id: 'r1', analysis_mode: 'deterministic', answer: 'Snapshot only.', key_points: [], risks: [], sources: [], meta: { warnings: [] } }
const ok = (value) => ({ ok: true, json: async () => value })

test('profile defaults are qualitative; serialization sanitizes only contract fields', () => {
  assert.equal(defaults.loss_tolerance, 'low')
  assert.equal(defaults.loss_capacity, 'unknown')
  assert.equal(defaults.liquidity_need, 'unknown')
  const normalized = profileApi.normalizeProfile({ ...defaults, display_name: ' x '.repeat(40), experience: 'expert', horizon: 'bad', interests: ['security', 'defi', 'security', 'bad'], wallet: 'secret', score: 99 })
  assert.equal(normalized.display_name.length, 40)
  assert.equal(normalized.experience, 'beginner')
  assert.equal(normalized.horizon, 'long')
  assert.deepEqual(Array.from(normalized.interests), ['defi', 'security'])
  assert.equal(normalized.wallet, undefined)
  assert.equal(normalized.score, undefined)
  assert.equal(profileApi.profilesEqual(undefined, null), true)
  assert.equal(profileApi.profilesEqual(defaults, { ...defaults, loss_capacity: 'low' }), false)
})

test('browser storage is opt-in only, handles blocked access, malformed data and reset removal', () => {
  const values = new Map(), calls = []
  const storage = () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { calls.push('save'); values.set(key, value) }, removeItem: (key) => { calls.push('remove'); values.delete(key) } })
  assert.equal(profileApi.saveProfile(defaults, false, () => { throw new Error('must not access') }), null)
  assert.equal(calls.length, 0)
  assert.equal(profileApi.loadProfile(storage).profile, null)
  assert.equal(profileApi.saveProfile({ ...defaults, display_name: 'Fin' }, true, storage), null)
  assert.equal(profileApi.loadProfile(storage).profile.display_name, 'Fin')
  assert.equal(profileApi.removeProfile(storage), null)
  assert.equal(values.size, 0)
  values.set(profileApi.PROFILE_STORAGE_KEY, 'not json')
  assert.match(profileApi.loadProfile(storage).error, /could not be read/)
  for (const helper of [() => profileApi.loadProfile(() => { throw new Error() }).error, () => profileApi.saveProfile(defaults, true, () => { throw new Error() }), () => profileApi.removeProfile(() => { throw new Error() })]) assert.equal(typeof helper(), 'string')
})

test('analysis request serializes profile optionally and accepts sourced arguments and applied profile', async () => {
  const calls = []
  const api = loadSource('lib/cryptoApi.ts', { fetch: async (url, init) => { calls.push({ url, init }); return ok({ ...response, applied_profile: defaults, personalized_notes: [{ title: 'Context', detail: 'Learn first.' }], pros_cons: { pros: [], cons: [{ title: 'Concern', detail: 'Limited evidence', source_ids: ['s1'], interpretation: true }], unknowns: [] }, sources: [{ source_id: 's1', title: 'Evidence', url: 'https://example.org', source_type: 'market' }] }) } })
  const signal = new AbortController().signal
  await api.analyzeCrypto({ asset_id: asset.id, question: ' Risks? ', profile: { ...defaults, credentials: 'omit', interests: ['security', 'security'] } }, signal)
  const payload = JSON.parse(calls[0].init.body)
  assert.equal(payload.question, 'Risks?')
  assert.deepEqual(payload.profile, { ...defaults, interests: ['security'] })
  await api.analyzeCrypto({ asset_id: asset.id, question: 'Risks?' }, signal)
  assert.equal('profile' in JSON.parse(calls[1].init.body), false)
  for (const fields of [{ personalized_notes: null }, { applied_profile: { ...defaults, loss_capacity: 'safe' } }, { pros_cons: { pros: [{ title: 'x', detail: 'y', source_ids: [1], interpretation: true }], cons: [], unknowns: [] } }, { sources: [{ source_id: 1, title: 'x', url: 'y', source_type: 'z' }] }]) {
    const invalidApi = loadSource('lib/cryptoApi.ts', { fetch: async () => ok({ ...response, ...fields }) })
    await assert.rejects(invalidApi.analyzeCrypto({ asset_id: asset.id, question: 'Risks?' }, signal), /unexpected crypto overview/)
  }
})

test('search and detail use canonical escaped IDs and bounds, rejecting mismatched detail', async () => {
  const calls = []
  const api = loadSource('lib/cryptoApi.ts', { fetch: async (url) => { calls.push(url); return ok(url.includes('/search?') ? { assets: [candidate, candidate], warnings: ['Coverage varies'] } : { asset: candidate }) } })
  const signal = new AbortController().signal
  assert.equal((await api.searchAssets(' btc & defi ', signal)).assets.length, 1)
  assert.equal(calls[0], '/api/v1/assets/search?q=btc%20%26%20defi')
  assert.equal((await api.getAsset(candidate.id, signal)).platforms.ethereum, '0x123')
  await assert.rejects(api.getAsset('other/id', signal), /unexpected asset details/)
  assert.equal(calls[2], '/api/v1/assets/other%2Fid')
  for (const query of ['a', ' '.repeat(20), 'a'.repeat(101)]) await assert.rejects(api.searchAssets(query, signal), /between 2 and 100/)
  for (const value of [{ assets: Array(21).fill(asset), warnings: [] }, { assets: [asset], warnings: [1] }, { assets: [{ ...candidate, platforms: [] }], warnings: [] }]) {
    await assert.rejects(loadSource('lib/cryptoApi.ts', { fetch: async () => ok(value) }).searchAssets('btc', signal), /invalid search results/)
  }
})

function mountPicker(overrides = {}) {
  const timers = new Map(), searches = [], details = [], selections = [], loading = []
  let serial = 0
  const globals = { window: { setTimeout(callback, ms) { assert.equal(ms, 350); timers.set(++serial, callback); return serial }, clearTimeout(id) { timers.delete(id) } } }
  const api = {
    searchAssets(query, signal) { const task = deferred(); searches.push({ query, signal, task }); return task.promise },
    getAsset(id, signal) { const task = deferred(); details.push({ id, signal, task }); return task.promise },
    ...overrides,
  }
  const props = { assets: [asset], selected: asset, disabled: false, assetsLoading: false, onSelect: (value) => selections.push(value), onDetailLoading: (value) => loading.push(value) }
  const view = mount('components/AssetPicker.tsx', 'AssetPicker', props, globals, { '../lib/cryptoApi': api })
  return {
    ...view, searches, details, selections, loading, props,
    query(value) { view.get((node) => node.props.id === 'asset-search').props.onChange({ target: { value } }); view.render(); return view.render() },
    flush() { for (const [id, callback] of timers) { timers.delete(id); callback() } },
    choose(id) { return view.get((node) => node.type === 'button' && node.props['aria-label']?.endsWith(`ID ${id}`)).props.onClick() },
  }
}

test('rendered search debounces, aborts stale queries, never auto-selects and retains selection', async () => {
  const view = mountPicker()
  let html = view.query('b')
  assert.match(html, /Enter at least 2 characters/)
  view.flush()
  assert.equal(view.searches.length, 0)
  view.query('btc')
  view.query('bitcoin')
  view.flush()
  assert.equal(view.searches.length, 1)
  assert.equal(view.searches[0].query, 'bitcoin')
  view.query('ethereum')
  assert.equal(view.searches[0].signal.aborted, true)
  view.flush()
  view.searches[0].task.resolve({ assets: [candidate], warnings: ['Stale warning'] })
  view.searches[1].task.resolve({ assets: [{ ...candidate, id: 'latest-id' }], warnings: ['Coverage varies'] })
  await settled()
  html = view.render()
  assert.match(html, /latest-id/)
  assert.doesNotMatch(html, /Stale warning/)
  assert.match(html, /Selected: Bitcoin/)
  assert.match(html, /ethereum.*0x123/)
  assert.match(html, /Coverage varies/)
  assert.equal(view.selections.length, 0)
  view.query('')
  html = view.render()
  assert.doesNotMatch(html, /latest-id/)
  assert.match(html, /Selected: Bitcoin/)
  view.unmount()
})

test('explicit dynamic selection needs full details, cancels stale detail and preserves selection on failure', async () => {
  const view = mountPicker()
  view.query('btc'); view.flush()
  view.searches[0].task.resolve({ assets: [candidate, { ...candidate, id: 'another-id' }], warnings: [] })
  await settled(); view.render()
  view.choose(candidate.id)
  assert.equal(view.selections.length, 0)
  assert.equal(view.loading.at(-1), true)
  assert.match(view.render(), /Loading full details/)
  view.choose('another-id')
  assert.equal(view.details[0].signal.aborted, true)
  view.details[0].task.resolve(candidate)
  view.details[1].task.reject(new Error('Detail unavailable'))
  await settled()
  assert.match(view.render(), /Current selection has not changed/)
  assert.equal(view.selections.length, 0)
  assert.equal(view.loading.at(-1), false)
  view.choose(candidate.id)
  const complete = { ...candidate, platforms: { base: '0xfull-detail' } }
  view.details[2].task.resolve(complete)
  await settled()
  assert.equal(view.selections[0], complete)
  view.render({ ...view.props, selected: complete, assets: [] })
  assert.match(view.query(''), /0xfull-detail/)
  view.unmount()
})

test('unmount aborts searches and explicit asset detail requests', async () => {
  const view = mountPicker()
  view.query('btc'); view.flush()
  view.searches[0].task.resolve({ assets: [candidate], warnings: [] })
  await settled(); view.render(); view.choose(candidate.id)
  view.unmount()
  assert.equal(view.searches[0].signal.aborted, true)
  assert.equal(view.details[0].signal.aborted, true)
  view.details[0].task.resolve(candidate)
  await settled()
  assert.equal(view.selections.length, 0)
})

test('search failure is announced without changing selection or guessing an asset', async () => {
  const view = mountPicker()
  view.query('missing'); view.flush()
  view.searches[0].task.reject(new Error('Provider unavailable. Try again.'))
  await settled()
  const html = view.render()
  assert.match(html, /role="status" aria-live="polite">Provider unavailable/)
  assert.match(html, /Selected: Bitcoin/)
  assert.equal(view.selections.length, 0)
  view.unmount()
})

test('rendered optional profile is collapsed and storage opt-in is unchecked', () => {
  const { ProfilePanel } = loadSource('components/ProfilePanel.tsx')
  const html = renderToStaticMarkup(React.createElement(ProfilePanel, { profile: defaults, enabled: false, remember: false, error: null, onChange() {}, onEnabled() {}, onRemember() {}, onReset() {} }))
  assert.match(html, /<details class="profile-panel">/)
  assert.doesNotMatch(html, /checked=""|open=""/)
  assert.match(html, /Willingness to accept losses/)
  assert.match(html, /Ability to absorb losses/)
  assert.match(html, /unknown/)
  assert.match(html, /Remember preferences in this browser/)
  assert.match(html, /maxLength="40"/)
  assert.doesNotMatch(html, /type="number"/)
})

test('form serializes optional profile, includes it in draft indicator, saves only with consent and reset removes', () => {
  const submissions = [], storageCalls = [], values = new Map()
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { storageCalls.push('save'); values.set(key, value) }, removeItem: (key) => { storageCalls.push('remove'); values.delete(key) } }
  const props = { assets: [asset], assetsLoading: false, assetsError: null, onRetryAssets() {}, onSubmit: async (value) => submissions.push(value), onCancel() {}, isLoading: false, lastSubmitted: null }
  const view = mount('components/AnalysisForm.tsx', 'AnalysisForm', props, { window: { localStorage, setTimeout, clearTimeout } })
  const panel = () => view.get((node) => node.type?.name === 'ProfilePanel')
  view.get((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(submissions[0].profile, undefined)
  panel().props.onChange({ ...defaults, display_name: 'Learner', loss_tolerance: 'high', loss_capacity: 'low' })
  view.render()
  assert.equal(storageCalls.length, 0)
  view.get((node) => node.type?.name === 'AssetPicker').props.onDetailLoading(true)
  view.render()
  view.get((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(submissions.length, 1, 'Pending dynamic details block submission')
  view.get((node) => node.type?.name === 'AssetPicker').props.onDetailLoading(false)
  view.render()
  panel().props.onEnabled(true)
  view.render()
  view.get((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(submissions[1].profile.loss_tolerance, 'high')
  assert.equal(submissions[1].profile.loss_capacity, 'low')
  assert.equal(storageCalls.length, 0)
  assert.doesNotMatch(view.render({ ...props, lastSubmitted: submissions[1] }), /Draft changed/)
  panel().props.onChange({ ...defaults, display_name: 'A new draft' })
  assert.match(view.render(), /Draft changed/)
  panel().props.onRemember(true)
  view.render()
  assert.equal(storageCalls.at(-1), 'save')
  panel().props.onChange({ ...defaults, display_name: 'Remember this' })
  view.render()
  assert.equal(storageCalls.filter((call) => call === 'save').length, 2)
  panel().props.onReset()
  view.render()
  assert.equal(storageCalls.at(-1), 'remove')
  assert.equal(values.size, 0)
  assert.equal(panel().props.enabled, false)
  assert.equal(panel().props.remember, false)
  assert.equal(panel().props.profile.display_name, '')
  view.unmount()
})

test('blocked browser storage remains an actionable rendered state and session research still works', () => {
  const submissions = []
  const window = { setTimeout, clearTimeout, get localStorage() { throw new Error('Blocked storage') } }
  const props = { assets: [asset], assetsLoading: false, assetsError: null, onRetryAssets() {}, onSubmit: async (value) => submissions.push(value), onCancel() {}, isLoading: false, lastSubmitted: null }
  const view = mount('components/AnalysisForm.tsx', 'AnalysisForm', props, { window })
  assert.match(view.render(), /Saved preferences could not be read/)
  const panel = () => view.get((node) => node.type?.name === 'ProfilePanel')
  panel().props.onRemember(true)
  assert.match(view.render(), /Preferences could not be saved/)
  panel().props.onEnabled(true)
  view.render()
  view.get((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].profile.experience, 'beginner')
  panel().props.onReset()
  assert.match(view.render(), /Clear this site&#x27;s browser storage/)
  assert.equal(panel().props.enabled, false)
  view.unmount()
})

test('completed profile context displays submitted/applied values and returned notes without draft relabeling', () => {
  const { ResearchContext } = loadSource('components/ResearchContext.tsx')
  const html = renderToStaticMarkup(React.createElement(ResearchContext, { request: { asset_id: asset.id, question: 'Risks?', profile: { ...defaults, display_name: 'Submitted learner', loss_tolerance: 'high', loss_capacity: 'low' } }, response: { ...response, applied_profile: { ...defaults, display_name: 'Applied learner' }, personalized_notes: [{ title: 'Read the evidence', detail: '<b>No guarantees</b>' }] } }))
  assert.match(html, /Submitted learner/)
  assert.match(html, /Applied learner/)
  assert.match(html, /Tailored notes/)
  assert.match(html, /&lt;b&gt;No guarantees&lt;\/b&gt;/)
  const unconfirmed = renderToStaticMarkup(React.createElement(ResearchContext, { request: { profile: defaults }, response }))
  assert.match(unconfirmed, /Personalization is not confirmed/)
})

test('pros/cons use only returned items, matching source IDs, safe links and labeled interpretations', () => {
  const { ProsCons } = loadSource('components/ProsCons.tsx')
  const props = { response: { ...response, sources: [{ source_id: 'real', title: 'Real evidence', url: 'https://example.org/evidence' }, { source_id: 'unsafe', title: 'Bad link', url: 'javascript:alert(1)' }, { title: 'No ID evidence', url: 'https://example.org/no-id' }], pros_cons: { pros: [{ title: 'One strength', detail: '<script>unsafe</script>', source_ids: ['real', 'real', 'missing', 'unsafe'], interpretation: true }], cons: [], unknowns: [{ title: 'Coverage unknown', detail: 'Incomplete data', source_ids: [], interpretation: false }] } } }
  const html = renderToStaticMarkup(React.createElement(ProsCons, props))
  assert.equal((html.match(/href=/g) ?? []).length, 1)
  assert.match(html, /href="https:\/\/example.org\/evidence"/)
  assert.doesNotMatch(html, /javascript:|No ID evidence|<script/)
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/)
  assert.match(html, /Evidence link unavailable for source ID missing/)
  assert.match(html, /Interpretation, not a direct source claim/)
  assert.match(html, /No potential concerns were returned/)
  assert.match(html, /No source IDs supplied/)
  const empty = renderToStaticMarkup(React.createElement(ProsCons, { response }))
  assert.equal((empty.match(/class="bullet-item"/g) ?? []).length, 0)
  assert.match(empty, /This does not mean none exist/)
})
