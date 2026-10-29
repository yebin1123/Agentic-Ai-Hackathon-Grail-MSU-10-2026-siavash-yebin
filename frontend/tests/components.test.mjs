import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
const modules = new Map()

// Compile the real TSX components using the existing TypeScript dependency.
function loadComponent(file) {
  if (modules.has(file.href)) return modules.get(file.href)
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const require = (name) => {
    if (!name.startsWith('.')) return nativeRequire(name)
    const tsx = new URL(`${name}.tsx`, file)
    return loadComponent(existsSync(tsx) ? tsx : new URL(`${name}.ts`, file))
  }
  vm.runInNewContext(code, { module, exports: module.exports, require, URL }, { filename: file.pathname })
  modules.set(file.href, module.exports)
  return module.exports
}

const { ResearchAnswer } = loadComponent(new URL('../src/components/ResearchAnswer.tsx', import.meta.url))
const { AnalysisForm } = loadComponent(new URL('../src/components/AnalysisForm.tsx', import.meta.url))
const asset = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', category: 'crypto' }
const request = { asset_id: asset.id, question: 'What changed in 24h, and will the price rise tomorrow?' }
const response = {
  asset, request_id: 'completed-request', analysis_mode: 'deterministic',
  answer: 'Combined legacy answer should not repeat when sections exist.',
  key_points: [{ category: 'market', title: 'Duplicate key point', detail: 'Do not repeat.' }],
  submitted_question: request.question,
  answer_sections: [
    { topic: 'market', title: '24-hour price and volume', answer: 'Price fell 2%. Volume is $10 million.', status: 'answered', limitation: null },
    { topic: 'supply', title: 'Supply and valuation', answer: 'Circulating supply is available.', status: 'limited', limitation: 'Maximum supply is unavailable.' },
    { topic: 'forecast', title: 'Tomorrow\'s price', answer: 'A price forecast is not connected.', status: 'unsupported', limitation: 'Snapshot data cannot predict future prices.' },
  ],
}
const renderAnswer = (value = response, completedRequest = request) => renderToStaticMarkup(React.createElement(ResearchAnswer, { request: completedRequest, response: value }))

test('completed submitted question is always visible, never inside details', () => {
  const html = renderAnswer()
  assert.match(html, /<h3>Submitted question<\/h3>/)
  assert.ok(html.includes(request.question))
  assert.doesNotMatch(html, /<details|<summary/)
  assert.match(html, /Request ID: completed-request/)
})

test('real answer cards render supported, limited and unsupported evidence with adjacent limitations', () => {
  const html = renderAnswer()
  assert.equal((html.match(/class="answer-section answer-section--/g) ?? []).length, 3)
  for (const label of ['Snapshot evidence', 'Partial evidence', 'Not connected']) assert.ok(html.includes(label))
  assert.match(html, /24-hour price and volume/)
  assert.match(html, /Price fell 2%/)
  assert.match(html, /Circulating supply is available\.<\/p><p class="answer-limitation"><strong>Limit:<\/strong> Maximum supply is unavailable\./)
  assert.match(html, /A price forecast is not connected\.<\/p><p class="answer-limitation"><strong>Limit:<\/strong> Snapshot data cannot predict future prices\./)
})

test('section responses do not duplicate the combined answer or key points panel', () => {
  const html = renderAnswer()
  assert.doesNotMatch(html, /Combined legacy answer|Duplicate key point|Key points|Below the surface|topic-level evidence coverage is unavailable/)
})

test('older backend and empty sections show an honest coverage notice, plain answer and key points', () => {
  for (const answer_sections of [undefined, []]) {
    const html = renderAnswer({ ...response, submitted_question: undefined, answer_sections })
    assert.ok(html.includes(request.question))
    assert.match(html, /topic-level evidence coverage is unavailable/)
    assert.match(html, /Combined legacy answer/)
    assert.match(html, /Key points/)
    assert.match(html, /Duplicate key point/)
    assert.doesNotMatch(html, /Snapshot evidence/)
  }
})

test('a mismatched echo cannot replace the locally paired completed question', () => {
  const html = renderAnswer({ ...response, submitted_question: 'An unrelated newer draft' })
  assert.ok(html.includes(request.question))
  assert.doesNotMatch(html, /An unrelated newer draft/)
})

test('question and answers stay plain text rather than rendering injected markup', () => {
  const html = renderAnswer({ ...response, answer_sections: [{ ...response.answer_sections[0], answer: '<script>alert(1)</script>' }] }, { ...request, question: '<b>Question</b>' })
  assert.match(html, /&lt;b&gt;Question&lt;\/b&gt;/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script|<b>/)
})

test('form renders precise snapshot prompts, scope guidance and submit semantics', () => {
  const props = { assets: [asset], assetsLoading: false, assetsError: null, onRetryAssets() {}, async onSubmit() {}, onCancel() {}, isLoading: false, lastSubmitted: null }
  const initial = renderToStaticMarkup(React.createElement(AnalysisForm, props))
  assert.match(initial, /24-hour price change and trading volume in the current snapshot/)
  assert.match(initial, /24h price &amp; volume/)
  assert.match(initial, /Supply &amp; valuation/)
  assert.match(initial, /Risks &amp; data gaps/)
  assert.match(initial, /Snapshot questions are supported/)
  assert.match(initial, /Forecasts, price-move causes, and security audits are not connected/)
  assert.match(initial, /Changing the draft does not update the answer until you submit/)
  assert.match(initial, /Explore this asset/)
  const edited = renderToStaticMarkup(React.createElement(AnalysisForm, { ...props, lastSubmitted: request }))
  assert.match(edited, /Resubmit question/)
  assert.match(edited, /Draft changed - resubmit to get a new answer/)
  const unchanged = renderToStaticMarkup(React.createElement(AnalysisForm, { ...props, lastSubmitted: { asset_id: asset.id, question: 'What are the 24-hour price change and trading volume in the current snapshot?' } }))
  assert.match(unchanged, /Resubmit question/)
  assert.doesNotMatch(unchanged, /Draft changed/)
  const pending = renderToStaticMarkup(React.createElement(AnalysisForm, { ...props, lastSubmitted: request, isLoading: true }))
  assert.match(pending, /Preparing answer/)
  assert.match(pending, /Cancel request/)
  assert.doesNotMatch(pending, /Draft changed/)
})
