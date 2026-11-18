import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createBaseline } from '../lib/baseline.js'

/** Run a test inside its own scratch cache directory. */
function withBaseline(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-balance-'))
  const file = path.join(dir, 'baseline.json')
  try {
    run({ dir, file })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a decreasing balance accumulates the used amount', () => withBaseline(({ file }) => {
  const baseline = createBaseline(file)
  assert.equal(baseline.sample('kimi', 20, true, 100), 0)
  assert.equal(baseline.sample('kimi', 18, true, 100), 2)
  assert.equal(baseline.sample('kimi', 15.5, true, 100), 4.5)
  baseline.flush()
}))

test('a top-up is ignored and does not reset the day', () => withBaseline(({ file }) => {
  const baseline = createBaseline(file)
  baseline.sample('kimi', 20, true, 100)
  assert.equal(baseline.sample('kimi', 18, true, 100), 2)
  // A jump up is a payment, not negative usage.
  assert.equal(baseline.sample('kimi', 118, true, 100), 2)
  // Usage then continues from the new anchor.
  assert.equal(baseline.sample('kimi', 117, true, 100), 3)
  baseline.flush()
}))

test('a new day starts the counter over', () => withBaseline(({ file }) => {
  const baseline = createBaseline(file)
  baseline.sample('kimi', 20, true, 100)
  baseline.sample('kimi', 18, true, 100)
  baseline.flush()
  const stored = JSON.parse(readFileSync(file, 'utf8'))
  stored.date = '1970-01-01'
  writeFileSync(file, JSON.stringify(stored))
  const again = createBaseline(file)
  assert.equal(again.sample('kimi', 17, true, 100), 0)
}))

test('a plan percentage only accumulates upwards', () => withBaseline(({ file }) => {
  const baseline = createBaseline(file)
  assert.equal(baseline.sample('qwen', 70, false, 10), 0)
  assert.equal(baseline.sample('qwen', 72.4, false, 10), 2.4)
  // A plan reset drops back to zero: that is not usage.
  assert.equal(baseline.sample('qwen', 0.1, false, 10), 2.4)
  assert.equal(baseline.sample('qwen', 1.1, false, 10), 3.4)
  baseline.flush()
}))