import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadModule(name, overrides = {}) {
  const file = new URL(`../src/lib/${name}.ts`, import.meta.url)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const context = {
    exports: {}, AbortController, DOMException, Headers, TypeError, Error, URL,
    require: (path) => loadModule(path.replace('./', ''), overrides),
    window: { setTimeout, clearTimeout }, ...overrides,
  }
  vm.runInNewContext(code, context, { filename: file.pathname })
  return context.exports
}

const { prepareHistory, chartGeometry } = loadModule('historyChart')
const { formatCurrency, formatPercent, formatAmount, formatTimestamp, safeUrl } = loadModule('format')
const point = (day, price) => ({ timestamp: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, price })

test('history filters invalid prices/dates, sorts, and deduplicates timestamps', () => {
  const result = prepareHistory([point(5, 5), point(1, 1), point(2, 2), point(2, 3),
    point(3, NaN), point(3, Infinity), point(3, -1), { timestamp: 'bad', price: 9 }, null, { timestamp: null, price: 2 }])
  assert.equal(result.discarded, 7)
  assert.deepEqual(Array.from(result.points, (value) => value.price), [1, 3, 5])
})

test('horizontal axis uses elapsed time rather than index', () => {
  const geometry = chartGeometry(prepareHistory([point(1, 1), point(2, 2), point(5, 4)]).points)
  const ratio = (geometry.coordinates[1].x - geometry.left) / (geometry.right - geometry.left)
  assert.equal(ratio, .25)
  assert.equal(geometry.coordinates[0].y, geometry.bottom)
  assert.equal(geometry.coordinates[2].y, geometry.top)
})

test('empty, single-point, flat, and zero-price histories are safe', () => {
  assert.equal(chartGeometry([]), null)
  const single = chartGeometry(prepareHistory([point(1, 0)]).points)
  assert.equal(single.coordinates[0].x, (single.left + single.right) / 2)
  assert.equal(single.coordinates[0].y, (single.top + single.bottom) / 2)
  const flat = chartGeometry(prepareHistory([point(1, 3), point(2, 3)]).points)
  assert.equal(flat.min, 3)
  assert.equal(flat.max, 3)
  assert.equal(flat.coordinates[0].y, flat.coordinates[1].y)
  assert.ok(flat.coordinates.every((value) => Number.isFinite(value.x) && Number.isFinite(value.y)))
})

test('missing and nonfinite values are unavailable, zero is real data', () => {
  for (const value of [undefined, null, NaN, Infinity]) {
    assert.equal(formatCurrency(value), 'Unavailable')
    assert.equal(formatPercent(value), 'Unavailable')
    assert.equal(formatAmount(value), 'Unavailable')
  }
  assert.equal(formatCurrency(0), '$0.00')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatTimestamp('invalid'), 'Unavailable')
  assert.match(formatTimestamp('2026-10-01T12:34:56Z'), /12:34:56.*UTC/)
})

test('small coins and tight y-axis ranges retain price precision', () => {
  assert.equal(formatCurrency(.00000012), '$0.00000012')
  assert.notEqual(formatCurrency(.00000012), formatCurrency(.00000013))
  assert.notEqual(formatCurrency(65000.001, .0005), formatCurrency(65000.002, .0005))
  assert.match(formatCurrency(1e-25), /E-25/)
})

test('external sources only use safe absolute HTTP(S) URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), undefined)
  assert.equal(safeUrl('data:text/html,bad'), undefined)
  assert.equal(safeUrl('/relative'), undefined)
  assert.equal(safeUrl(undefined), undefined)
  assert.equal(safeUrl('https://example.org/source'), 'https://example.org/source')
})

test('request helper reports HTTP, malformed JSON, and network failures', async () => {
  const signal = new AbortController().signal
  for (const [fetch, message] of [
    [async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Provider temporarily unavailable' } }) }), /Provider temporarily unavailable/],
    [async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError() } }), /HTTP 502/],
    [async () => ({ ok: true, json: async () => null }), /invalid JSON/],
    [async () => { throw new TypeError('Failed to fetch') }, /Cannot reach the research service/],
  ]) {
    const { requestJson } = loadModule('cryptoApi', { fetch })
    await assert.rejects(requestJson('/api/test', {}, signal), message)
  }
})

test('caller cancellation aborts fetch and clears timeout', async () => {
  let cleared = false
  const { requestJson } = loadModule('cryptoApi', {
    window: { setTimeout: () => 1, clearTimeout: () => { cleared = true } },
    fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))),
  })
  const controller = new AbortController()
  const request = requestJson('/api/test', {}, controller.signal)
  controller.abort()
  await assert.rejects(request, (error) => error.name === 'AbortError')
  assert.equal(cleared, true)
})

test('timeout is exactly 20 seconds and aborts the native request', async () => {
  let fireTimeout, duration, cleared = false
  const { requestJson } = loadModule('cryptoApi', {
    window: { setTimeout: (callback, ms) => { fireTimeout = callback; duration = ms; return 1 }, clearTimeout: () => { cleared = true } },
    fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))),
  })
  const request = requestJson('/api/test')
  assert.equal(duration, 20_000)
  fireTimeout()
  await assert.rejects(request, /longer than 20 seconds/)
  assert.equal(cleared, true)
})

test('crypto endpoints use exact requests and never call stock analysis', async () => {
  const calls = []
  const asset = { id: 'btc/id', symbol: 'btc', name: 'Bitcoin', category: 'crypto' }
  const api = loadModule('cryptoApi', {
    fetch: async (url, init) => {
      calls.push({ url, init })
      return { ok: true, json: async () => url.endsWith('/assets') ? { assets: [asset, asset] } : url.includes('/crypto-history/')
        ? { asset_id: asset.id, timeframe: '1d', currency: 'USD', points: [], warnings: [] }
        : { asset, request_id: 'test', analysis_mode: 'deterministic', answer: 'test response', key_points: [], risks: [], sources: [], meta: { warnings: [] } } }
    },
  })
  const signal = new AbortController().signal
  assert.equal((await api.getAssets(signal)).length, 1)
  await api.analyzeCrypto({ asset_id: ' btc/id ', question: ' What are supply and liquidity risks? ' }, signal)
  await api.getCryptoHistory(asset.id, '1d', signal)
  assert.deepEqual(calls.map((call) => call.url), ['/api/v1/assets', '/api/v1/crypto-analysis', '/api/v1/crypto-history/btc%2Fid?timeframe=1d'])
  assert.equal(calls[1].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].init.body), { asset_id: 'btc/id', question: 'What are supply and liquidity risks?' })
  assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json')
})

test('unexpected assets, analysis mode, and stale history identities fail explicitly', async () => {
  const signal = new AbortController().signal
  const api = loadModule('cryptoApi', { fetch: async () => ({ ok: true, json: async () => ({ assets: [{ id: 'btc' }], analysis_mode: 'ai', points: [], warnings: [], asset_id: 'other', timeframe: '1d', currency: 'USD' }) }) })
  await assert.rejects(api.getAssets(signal), /invalid asset list/)
  await assert.rejects(api.analyzeCrypto({ asset_id: 'btc', question: 'risks' }, signal), /unexpected crypto overview/)
  await assert.rejects(api.getCryptoHistory('btc', '1d', signal), /unexpected price history/)
})

test('analysis accepts optional section fields and rejects malformed evidence metadata', async () => {
  const request = { asset_id: 'btc', question: 'What is the 24h volume?' }
  const section = { topic: 'market', title: 'Volume', answer: 'Unavailable.', status: 'limited', limitation: 'Provider data is missing.' }
  const base = { asset: { id: 'btc', symbol: 'btc', name: 'Bitcoin', category: 'crypto' }, request_id: 'test', analysis_mode: 'deterministic', answer: 'Volume unavailable.', key_points: [], risks: [], sources: [], meta: { warnings: [] } }
  const signal = new AbortController().signal
  const analyze = (fields) => loadModule('cryptoApi', { fetch: async () => ({ ok: true, json: async () => ({ ...base, ...fields }) }) }).analyzeCrypto(request, signal)
  for (const fields of [{}, { answer_sections: [] }, { submitted_question: request.question, answer_sections: [section, { ...section, status: 'answered', limitation: null }, { ...section, status: 'unsupported' }] }]) {
    assert.equal((await analyze(fields)).answer, base.answer)
  }
  for (const fields of [{ submitted_question: null }, { answer_sections: null }, { answer_sections: [{}] }, { answer_sections: [{ ...section, status: 'guessed' }] }, { answer_sections: [{ ...section, limitation: 42 }] }]) {
    await assert.rejects(analyze(fields), /unexpected crypto overview/)
  }
})
