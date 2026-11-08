import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAdapters, SETUP_ADAPTERS, adapterFor } from '../lib/registry.js'

const adapters = buildAdapters({})

test('every adapter has an id and a label', () => {
  for (const adapter of adapters) {
    assert.equal(typeof adapter.id, 'string')
    assert.ok(adapter.id.length > 0, 'empty adapter id')
    assert.equal(typeof adapter.label, 'string')
    assert.ok(['money', 'plan', 'console', 'account'].includes(adapter.kind), `bad kind ${adapter.kind} (${adapter.id})`)
  }
})

test('DSH provider ids resolve, aliases included', () => {
  assert.equal(adapterFor('deepseek').id, 'deepseek')
  assert.equal(adapterFor('moonshotai').id, 'kimi-coding')
  assert.equal(adapterFor('moonshotai-cn').id, 'kimi-coding')
  assert.equal(adapterFor('qwen-token-plan-cn').kind, 'plan')
  assert.equal(adapterFor('not-a-vendor'), null)
})

test('the setup list asks once per credential ref', () => {
  const refs = SETUP_ADAPTERS.map((adapter) => adapter.secret.ref)
  assert.equal(new Set(refs).size, refs.length)
  assert.ok(refs.includes('QWEN_TOKEN_PLAN_COOKIE'))
  assert.ok(refs.includes('DEEPSEEK_API_KEY'))
})

test('factory adapters keep their own state', () => {
  const qwen = adapterFor('qwen-token-plan-cn')
  assert.equal(typeof qwen.fetchSecret, 'function')
  assert.equal(typeof qwen.validate, 'function')
  const second = buildAdapters({})[4]
  assert.notEqual(qwen, second, 'each build must return a fresh adapter')
})