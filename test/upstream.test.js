import test from 'node:test'
import assert from 'node:assert/strict'

import {
  authHeaders,
  decimal,
  optionalJson,
  requestError,
  requestJson,
  timestamp,
  windowRow,
  MAX_RESPONSE_BYTES,
} from '../lib/upstream.js'

function jsonResponse(status, body, headers = {}) {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => text,
  }
}

function capture(response, init) {
  let seen = null
  const fetchImpl = async (url, options) => { seen = { url, options }; return response }
  return { fetchImpl, seen: () => seen }
}

test('auth modes are not all Bearer', () => {
  assert.equal(authHeaders('k').authorization, 'Bearer k')
  assert.equal(authHeaders('k', 'raw').authorization, 'k')
  assert.equal(authHeaders('k', 'x-api-key')['x-api-key'], 'k')
  assert.equal(authHeaders('k', 'token').authorization, 'token k')
  assert.equal(authHeaders('k', 'cookie').cookie, 'k')
  assert.equal(authHeaders('', 'bearer').authorization, undefined)
})

test('strict decimal parsing rejects non-amounts', () => {
  assert.equal(decimal('12.50'), 12.5)
  assert.equal(decimal(-3.25), -3.25)
  assert.equal(decimal('1e3'), null)
  assert.equal(decimal('0x10'), null)
  assert.equal(decimal(''), null)
  assert.equal(decimal(undefined), null)
})

test('timestamps accept ISO strings, epoch ms and epoch seconds', () => {
  const iso = Date.parse('2026-12-01T00:00:00Z')
  assert.equal(timestamp('2026-12-01T00:00:00Z'), iso)
  assert.equal(timestamp(iso), iso)
  assert.equal(timestamp(iso / 1000), iso)
  assert.equal(timestamp(null), null)
})

test('a window clamps the used percentage', () => {
  assert.deepEqual(windowRow('5-hour', 140, null), {
    label: '5-hour', usedPct: 100, remainPct: 0, resetAt: null,
  })
  assert.equal(windowRow('Weekly', -5, null).usedPct, 0)
})

test('3xx is a redirect, 401/403 is an expired credential', async () => {
  const redirect = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(302, {}),
  })
  assert.equal(redirect.ok, false)
  assert.equal(redirect.authFailed, undefined)
  assert.match(redirect.error, /redirect/)

  const denied = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(403, {}),
  })
  assert.equal(denied.authFailed, true)
  assert.equal(requestError(denied).status, 'expired')
})

test('429 is retryable and honours Retry-After', async () => {
  const result = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(429, {}, { 'retry-after': '2' }),
  })
  assert.equal(result.retryable, true)
  assert.equal(result.retryAfterMs, 2000)
})

test('HTTP 200 can still carry a business-level auth code', async () => {
  const result = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(200, { code: 403, message: 'not logged in' }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.authFailed, true)
})

test('oversized and non-JSON responses are rejected', async () => {
  const big = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(200, {}, { 'content-length': String(MAX_RESPONSE_BYTES + 1) }),
  })
  assert.match(big.error, /1 MiB/)
  const notJson = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => ({
      ok: true, status: 200, headers: { get: () => null }, text: async () => '<html>login</html>',
    }),
  })
  assert.match(notJson.error, /not JSON/)
})

test('method, body and headers reach the wire unchanged', async () => {
  const mock = capture(jsonResponse(200, { ok: 1 }))
  await requestJson('https://nano-gpt.com/api/check-balance', {
    key: 'sk-1', auth: 'x-api-key', method: 'POST', body: '{}',
    headers: { 'content-type': 'application/json' }, fetchImpl: mock.fetchImpl,
  })
  const { options } = mock.seen()
  assert.equal(options.method, 'POST')
  assert.equal(options.body, '{}')
  assert.equal(options.headers['x-api-key'], 'sk-1')
  assert.equal(options.headers.authorization, undefined)
  assert.equal(options.headers['content-type'], 'application/json')
  assert.equal(options.redirect, 'manual')
})

test('a network failure is retryable, not fatal', async () => {
  const result = await requestJson('https://vendor.test/x', {
    fetchImpl: async () => { throw new Error('ECONNRESET') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.retryable, true)
})

test('optionalJson turns a 403 into undefined for silent degradation', async () => {
  const denied = await optionalJson('https://openrouter.ai/api/v1/credits', {
    key: 'inference-key',
    fetchImpl: async () => jsonResponse(403, {}),
  })
  assert.equal(denied, undefined)
  const ok = await optionalJson('https://vendor.test/x', {
    fetchImpl: async () => jsonResponse(200, { data: 1 }),
  })
  assert.deepEqual(ok, { data: 1 })
})
