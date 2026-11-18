import test from 'node:test'
import assert from 'node:assert/strict'

import { secretRefCandidates } from '../index.js'
import { SETUP_ADAPTERS, adapterFor, buildAdapters } from '../lib/registry.js'
import { VENDORS } from '../lib/providers/vendors.js'
import { parseZaiQuota } from '../lib/providers/glm-coding.js'
import { parseOpenRouter } from '../lib/providers/openrouter.js'
import { parseKimiUsage } from '../lib/providers/moonshot.js'

const byId = new Map(VENDORS.map((vendor) => [vendor.id, vendor]))

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  }
}

// ── pure wire contracts, one assertion per vendor's unit/field quirk ──────

test('wallet vendors keep their own unit and currency', () => {
  assert.deepEqual(byId.get('siliconflow').parse({ info: { data: { totalBalance: 12.345 } } }),
    { kind: 'money', amount: 12.35, currency: 'CNY' })
  // Novita is 1/10000 USD, Hyperbolic is cents, DeepInfra is a negative balance.
  assert.deepEqual(byId.get('novita').parse({ balance: { availableBalance: '12345' } }),
    { kind: 'money', amount: 1.23, currency: 'USD' })
  assert.deepEqual(byId.get('hyperbolic').parse({ balance: { balanceCents: 250 } }),
    { kind: 'money', amount: 2.5, currency: 'USD' })
  assert.deepEqual(byId.get('deepinfra').parse({ checklist: { stripe_balance: -7.5 } }),
    { kind: 'money', amount: 7.5, currency: 'USD' })
  assert.equal(byId.get('deepinfra').parse({ checklist: { stripe_balance: 3 } }).amount, -3)
  assert.deepEqual(byId.get('vercel-ai-gateway').parse({ credits: { balance: '9.87' } }),
    { kind: 'money', amount: 9.87, currency: 'USD' })
  assert.equal(byId.get('siliconflow').parse({ info: {} }), null)
})

test('Ollama Cloud usage is a 0-1 fraction, not a percentage', () => {
  const row = byId.get('ollama-cloud').parse({ usage: { limits: { session: { usage: 0.25 }, weekly: { usage: 0.5 } } } })
  assert.equal(row.kind, 'plan')
  assert.deepEqual(row.windows.map((win) => [win.label, win.usedPct]), [['Session', 25], ['Weekly', 50]])
  assert.equal(row.usedPct, 25)
  assert.equal(byId.get('ollama-cloud').parse({ usage: { limits: {} } }), null)
})

test('quota vendors derive the used percentage from absolute counts', () => {
  const chutes = byId.get('chutes').parse({ quota: { quota: 100, used: 40 } })
  assert.equal(chutes.windows[0].usedPct, 40)
  assert.equal(chutes.windows[0].resetAt, null, 'the endpoint reports no reset time')
  const synthetic = byId.get('synthetic').parse({ quotas: { subscription: { requests: 20, limit: 100 } } })
  assert.equal(synthetic.windows[0].usedPct, 20)
  const apigoto = byId.get('apigoto').parse({
    usage: {
      subscription: { used: 30, limit: 100, window_sec: 18000, plan_name: 'Pro' },
      balance_usd: '4.50',
    },
  })
  assert.equal(apigoto.windows[0].label, '5-hour')
  assert.deepEqual(apigoto.notes, ['4.5 USD wallet'])
  assert.equal(apigoto.plan, 'Pro')
})

test('a secondary endpoint failing does not erase the primary result', () => {
  const zenmux = byId.get('zenmux').parse({
    subscription: { data: { quota_5_hour: { usage_percentage: 0.2 }, plan: { tier: 'Pro' } } },
    balance: undefined,
  })
  assert.equal(zenmux.kind, 'plan')
  assert.equal(zenmux.windows[0].usedPct, 20)
  const walletOnly = byId.get('zenmux').parse({
    subscription: undefined,
    balance: { data: { total_credits: 8, currency: 'USD' } },
  })
  assert.deepEqual(
    { kind: walletOnly.kind, amount: walletOnly.amount, currency: walletOnly.currency },
    { kind: 'money', amount: 8, currency: 'USD' },
  )
  const nanogpt = byId.get('nanogpt').parse({
    usage: { active: true, state: 'active', dailyInputTokens: { percentUsed: 0.3 } },
    balance: undefined,
  })
  assert.equal(nanogpt.windows[0].usedPct, 30)
  assert.deepEqual(nanogpt.notes, [])
})

test('MiniMax reports auth failures in the body, not the status line', () => {
  const spec = byId.get('minimax-cn')
  assert.deepEqual(spec.check({ remains: { base_resp: { status_code: 1004 } } }),
    { status: 'expired', detail: 'MiniMax subscription key rejected' })
  assert.equal(spec.check({ remains: { base_resp: { status_code: 0 } } }), null)
  const row = spec.parse({
    remains: {
      base_resp: { status_code: 0 },
      model_remains: [{ model_name: 'general', current_interval_remaining_percent: 60, current_weekly_remaining_percent: 90 }],
    },
  })
  assert.deepEqual(row.windows.map((win) => win.usedPct), [40, 10])
})

// ── the two providers that used to be "console link only" ────────────────

test('Z.ai quota reads the model pools and ignores unrelated limits', () => {
  const row = parseZaiQuota({
    data: {
      level: 'PRO',
      limits: [
        { type: 'CREDIT_LIMIT', unit: 3, percentage: 35, nextResetTime: '2026-11-09T00:00:00Z' },
        { type: 'TOKENS_LIMIT', unit: 6, percentage: 60 },
        { type: 'SEARCH_LIMIT', unit: 3, percentage: 99 },
      ],
    },
  })
  assert.equal(row.kind, 'plan')
  assert.equal(row.plan, 'PRO')
  assert.deepEqual(row.windows.map((win) => [win.label, win.usedPct]), [['5-hour', 35], ['Weekly', 60]])
  assert.equal(parseZaiQuota({ data: {} }), null)
})

test('the two Z.ai regions use different auth and hosts', async () => {
  const cn = adapterFor('zai-coding-cn')
  const intl = adapterFor('zai-coding')
  const quota = { data: { limits: [{ type: 'CREDIT_LIMIT', unit: 3, percentage: 10 }] } }
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url, authorization: init.headers.authorization })
    return jsonResponse(200, quota)
  }
  await cn.fetchSecret('key-cn', { fetchImpl })
  await intl.fetchSecret('key-intl', { fetchImpl })
  assert.equal(seen[0].authorization, 'Bearer key-cn')
  assert.match(seen[0].url, /open\.bigmodel\.cn.*type=1/)
  assert.equal(seen[1].authorization, 'key-intl', 'international host needs a bare Authorization')
  assert.match(seen[1].url, /api\.z\.ai/)
})

test('OpenRouter falls back to the key window when /credits is forbidden', async () => {
  const keyBody = { data: { limit: 10, limit_remaining: 4, usage: 6, is_free_tier: false } }
  const money = parseOpenRouter(keyBody, { data: { total_credits: 20, total_usage: 12 } })
  assert.equal(money.kind, 'money')
  assert.equal(money.amount, 8)
  assert.equal(money.currency, 'USD')
  const plan = parseOpenRouter(keyBody, undefined)
  assert.equal(plan.kind, 'plan')
  assert.equal(plan.windows[0].usedPct, 60)

  const adapter = adapterFor('openrouter')
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    return url.includes('/credits') ? jsonResponse(403, {}) : jsonResponse(200, keyBody)
  }
  const row = await adapter.fetchSecret('sk-or', { fetchImpl })
  assert.equal(row.status, 'ok')
  assert.equal(row.kind, 'plan', 'a 403 on the secondary call must not fail the row')
  assert.equal(urls.length, 2)
})

// ── Kimi subscription + wallet auto-fallback ─────────────────────────────

test('Kimi usage handles both payload generations', () => {
  const modern = parseKimiUsage({ usages: { limit_5h: { used_ratio: 0.25 }, limit_month_total: { used_ratio: 0.5 } } })
  assert.deepEqual(modern.windows.map((win) => [win.label, win.usedPct]), [['5-hour', 25], ['Monthly', 50]])
  const legacy = parseKimiUsage({
    limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: 100, remaining: 70 } }],
    usage: { limit: 200, remaining: 100 },
  })
  assert.deepEqual(legacy.windows.map((win) => win.usedPct), [30, 50])
  assert.equal(parseKimiUsage({}), null)
})

test('a Kimi key without a coding subscription falls back to the wallet', async () => {
  const adapter = adapterFor('kimi-coding')
  const fetchImpl = async (url) => url.includes('api.kimi.com')
    ? jsonResponse(404, {})
    : jsonResponse(200, { data: { available_balance: 14.99, voucher_balance: 0 } })
  const row = await adapter.fetchSecret('kimi-key', { row: { id: 'kimi-coding' }, fetchImpl })
  assert.equal(row.status, 'ok')
  assert.equal(row.kind, 'money')
  assert.equal(row.amount, 14.99)
})

// ── end-to-end request wiring ────────────────────────────────────────────

test('NanoGPT picks the management host and posts with x-api-key', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url.includes('check-balance')) return jsonResponse(200, { usd_balance: '5.50' })
    return jsonResponse(200, { active: true, state: 'active', dailyInputTokens: { percentUsed: 0.1 } })
  }
  const row = await byId.get('nanogpt').fetchSecret('sk-nano-mgmt-abc', { fetchImpl })
  assert.equal(row.status, 'ok')
  assert.match(calls[0].url, /management\/v1\/subscription/)
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-nano-mgmt-abc')
  assert.match(calls[1].url, /check-balance/)
  assert.equal(calls[1].init.method, 'POST')
  assert.equal(calls[1].init.headers['x-api-key'], 'sk-nano-mgmt-abc')
  assert.deepEqual(row.notes, ['5.5 USD wallet'])
})

test('Ollama Cloud sends a bare Authorization header', async () => {
  let seen
  const row = await byId.get('ollama-cloud').fetchSecret('ollama-key', {
    fetchImpl: async (url, init) => {
      seen = init.headers
      return jsonResponse(200, { limits: { session: { usage: 0.1 } } })
    },
  })
  assert.equal(seen.authorization, 'ollama-key')
  assert.equal(row.kind, 'plan')
})

test('the setup page rejects a bad key before storing it', async () => {
  const denied = await byId.get('siliconflow').validate('wrong-key', {
    fetchImpl: async () => jsonResponse(401, {}),
  })
  assert.equal(denied.ok, false)
  assert.match(denied.message, /rejected/)
  const accepted = await byId.get('siliconflow').validate('good-key', {
    fetchImpl: async () => jsonResponse(200, { data: { totalBalance: 1 } }),
  })
  assert.equal(accepted.ok, true)

  // OpenRouter validates even when the management-only endpoint 403s.
  const openrouter = await adapterFor('openrouter').validate('sk-or', {
    fetchImpl: async (url) => url.includes('/credits')
      ? jsonResponse(403, {})
      : jsonResponse(200, { data: { limit: 10, limit_remaining: 9 } }),
  })
  assert.equal(openrouter.ok, true)
})

test('credential alias fallbacks and registry coverage', () => {
  const go = adapterFor('opencode-go')
  assert.deepEqual(secretRefCandidates(go.secret, null), ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'])
  assert.deepEqual(secretRefCandidates(go.secret, 'CUSTOM'), ['CUSTOM', 'OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'])
  assert.deepEqual(secretRefCandidates(adapterFor('qwen-token-plan-cn').secret, 'ANY_KEY'), ['QWEN_TOKEN_PLAN_COOKIE'])

  for (const id of ['siliconflow', 'novita', 'hyperbolic', 'deepinfra', 'vercel-ai-gateway',
    'ollama-cloud', 'chutes', 'synthetic', 'nanogpt', 'minimax', 'minimax-cn', 'zenmux',
    'apigoto', 'zai-coding', 'zai-coding-cn', 'glm-coding', 'openrouter']) {
    assert.ok(adapterFor(id), `missing adapter for ${id}`)
  }
  assert.equal(adapterFor('minimax').id, 'minimax', 'the international host must not be aliased to the CN one')
  assert.equal(adapterFor('minimax').secret.ref, 'MINIMAX_API_KEY')
  assert.equal(adapterFor('minimax-cn').secret.ref, 'MINIMAX_CN_API_KEY')

  const refs = SETUP_ADAPTERS.map((adapter) => adapter.secret.ref)
  assert.equal(new Set(refs).size, refs.length, 'each credential ref must get one setup row')
  assert.ok(buildAdapters({}).length >= 20)
})
