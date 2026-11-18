import test from 'node:test'
import assert from 'node:assert/strict'

import deepseek from '../lib/providers/deepseek.js'
import xiaomiApi from '../lib/providers/xiaomi-api.js'
import mimoPlan from '../lib/providers/mimo-plan.js'
import { parseOpencodeUsage } from '../lib/providers/opencode-go.js'
import moonshot from '../lib/providers/moonshot.js'

test('DeepSeek balance_infos prefers CNY', () => {
  const body = {
    balance_infos: [
      { currency: 'USD', total_balance: '1.00' },
      { currency: 'CNY', total_balance: '4.95', granted_balance: '0.50' },
    ],
  }
  assert.deepEqual(deepseek.parseKey(body), { amount: 4.95, currency: 'CNY', bonus: 0.5 })
  assert.equal(deepseek.parseKey({}), null)
})

test('MiMo wallet reads total_available', () => {
  const body = { balance_infos: [{ currency: 'CNY', total_available: '20.49', cash_balance: '20.49' }] }
  assert.equal(xiaomiApi.parseKey(body).amount, 20.49)
})

test('MiMo Token Plan turns credits into a used percentage', () => {
  const body = {
    object: 'token_plan',
    plan_code: 'lite',
    auto_renew: true,
    period: { end_at: '2026-12-01T00:00:00+08:00' },
    quota: { used_credits: 300, total_credits: 1200 },
  }
  const plan = mimoPlan.parsePlan(body)
  assert.equal(plan.plan, 'Lite')
  assert.equal(plan.autoRenew, true)
  assert.equal(Math.round(plan.usedPct), 25)
  assert.equal(Math.round(plan.remainPct), 75)
  assert.equal(mimoPlan.parsePlan({ object: 'nope' }), null)
})

test('OpenCode usage exposes three labelled windows', () => {
  const body = {
    usage: {
      monthly: { percent: 12, resetsAt: '2026-12-01T00:00:00Z' },
      weekly: { percent: 40 },
      rolling: { percent: 75 },
    },
  }
  const plan = parseOpencodeUsage(body)
  assert.deepEqual(plan.windows.map((win) => [win.label, win.usedPct]), [['Monthly', 12], ['Weekly', 40], ['5-hour', 75]])
  assert.equal(plan.usedPct, 12)
  assert.equal(plan.windows[0].resetAt, Date.parse('2026-12-01T00:00:00Z'))
})

test('Moonshot balance reads data.available_balance', () => {
  assert.deepEqual(moonshot.parseKey({ data: { available_balance: 14.99, voucher_balance: 0 } }), {
    amount: 14.99,
    currency: 'CNY',
    bonus: 0,
  })
  assert.equal(moonshot.parseKey({}), null)
})