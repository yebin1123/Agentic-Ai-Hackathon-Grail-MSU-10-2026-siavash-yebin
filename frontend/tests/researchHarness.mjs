import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
export function loadSource(path, globals = {}, imports = {}) {
  const file = new URL(`../src/${path}`, import.meta.url)
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, AbortController, DOMException, Headers, TypeError, Error,
    window: { setTimeout, clearTimeout }, ...globals,
    require(name) {
      if (imports[name]) return imports[name]
      if (!name.startsWith('.')) return nativeRequire(name)
      const tsx = new URL(`${name}.tsx`, file)
      const target = existsSync(tsx) ? tsx : new URL(`${name}.ts`, file)
      return loadSource(target.pathname.split('/src/')[1], globals)
    },
  }, { filename: file.pathname })
  return module.exports
}

export function mount(path, componentName, initialProps, globals = {}, imports = {}) {
  const slots = [], effects = []
  let cursor, tree, props = initialProps
  const hooks = {
    ...React,
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
      const index = cursor++, prior = slots[index]
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) effects.push(() => {
        prior?.cleanup?.()
        slots[index] = { deps, cleanup: effect() }
      })
    },
  }
  const Component = loadSource(path, globals, { ...imports, react: hooks })[componentName]
  function render(next = props) {
    props = next
    cursor = 0
    tree = Component(props)
    while (effects.length) effects.shift()()
    return renderToStaticMarkup(tree)
  }
  function nodes(node = tree) {
    if (!React.isValidElement(node)) return []
    return [node, ...React.Children.toArray(node.props.children).flatMap((child) => nodes(child))]
  }
  const get = (predicate) => {
    const node = nodes().find(predicate)
    assert.ok(node, 'Expected rendered element')
    return node
  }
  render()
  return { render, get, nodes, unmount() { for (const slot of slots) slot?.cleanup?.() } }
}

export const settled = () => new Promise((resolve) => setImmediate(resolve))
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
