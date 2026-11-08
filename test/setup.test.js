import test from 'node:test'
import assert from 'node:assert/strict'

import { selectSetupEntries } from '../index.js'
import { BASE_ADAPTERS } from '../lib/registry.js'

const SPECS = [
  { id: 'deepseek', label: 'DeepSeek', ref: 'DEEPSEEK_API_KEY', type: 'key' },
  { id: 'openrouter', label: 'OpenRouter', ref: 'OPENROUTER_API_KEY', type: 'key' },
  { id: 'novita', label: 'Novita', ref: 'NOVITA_API_KEY', type: 'key' },
]

const STATUS = {
  DEEPSEEK_API_KEY: { set: true, masked: 'sk-***' },
  OPENROUTER_API_KEY: { set: false },
  NOVITA_API_KEY: { set: false },
}

test('setup lists only enabled providers and stored keys by default', () => {
  const rows = selectSetupEntries(SPECS, new Set(['deepseek']), STATUS)
  assert.deepEqual(rows.map((row) => row.id), ['deepseek'])
  assert.equal(rows[0].enabled, true)
  assert.equal(rows[0].set, true)
  assert.equal(rows[0].masked, 'sk-***')
})

test('a disabled provider with a saved key stays visible so it can be cleared', () => {
  const rows = selectSetupEntries(SPECS, new Set(), {
    ...STATUS,
    NOVITA_API_KEY: { set: true },
  })
  assert.deepEqual(rows.map((row) => row.id), ['deepseek', 'novita'])
  assert.equal(rows[1].enabled, false)
  assert.equal(rows[1].set, true)
})

test('includeAll exposes the whole catalogue with enabled flags', () => {
  const rows = selectSetupEntries(SPECS, new Set(['openrouter']), STATUS, true)
  assert.deepEqual(rows.map((row) => row.id), ['deepseek', 'openrouter', 'novita'])
  assert.deepEqual(rows.map((row) => row.enabled), [false, true, false])
})

test('an alias or renamed ref still counts as configured', () => {
  // The host tries a renamed profile ref, the vendor default, then aliases.
  // A disabled vendor whose key lives under a fallback name must stay in the
  // default setup list so the user can clear it.
  const SPECS_WITH_REFS = [
    {
      id: 'opencode-go', label: 'OpenCode Go',
      ref: 'OPENCODE_GO_API_KEY',
      refs: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'],
    },
    {
      id: 'xiaomi', label: 'Xiaomi MIMO',
      ref: 'MY_XIAOMI_KEY',
      refs: ['MY_XIAOMI_KEY', 'XIAOMI_API_KEY'],
    },
  ]
  const status = {
    OPENCODE_GO_API_KEY: { set: false },
    OPENCODE_API_KEY: { set: true, masked: 'sk-***' },
    MY_XIAOMI_KEY: { set: false },
    XIAOMI_API_KEY: { set: false },
  }
  const rows = selectSetupEntries(SPECS_WITH_REFS, new Set(), status)
  assert.deepEqual(rows.map((row) => row.id), ['opencode-go'])
  assert.equal(rows[0].enabled, false)
  assert.equal(rows[0].set, true)
  assert.equal(rows[0].masked, 'sk-***')
  assert.equal(rows[0].ref, 'OPENCODE_GO_API_KEY', 'the form keeps its write target')
})

test('missing credential status is treated as not configured', () => {
  const rows = selectSetupEntries(SPECS, new Set(['novita']), {})
  assert.equal(rows.length, 1)
  assert.equal(rows[0].set, false)
  assert.equal(rows[0].enabled, true)
})

test('no enabled provider and no stored key yields an empty, non-crashing list', () => {
  assert.deepEqual(selectSetupEntries(SPECS, new Set(), {}), [])
  assert.deepEqual(selectSetupEntries(SPECS, null, undefined), [])
})

test('the real catalogue has one setup row per credential ref', () => {
  const refs = BASE_ADAPTERS
    .filter((adapter) => adapter.setup || adapter.secret?.type === 'cookie')
    .map((adapter) => adapter.secret.ref)
  assert.ok(refs.length >= 10, 'the vendor catalogue should be present')
  assert.equal(new Set(refs).size, refs.length, 'duplicate refs would open two forms at once')
})
