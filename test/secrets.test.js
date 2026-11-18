import test from 'node:test'
import assert from 'node:assert/strict'

import { looksLikeCookie, normalizeCookie } from '../lib/secrets.js'

test('normalizeCookie strips the header name and line wrapping', () => {
  assert.equal(normalizeCookie('Cookie: a=1; b=2'), 'a=1; b=2')
  assert.equal(normalizeCookie('a=1;\r\n   b=2'), 'a=1; b=2')
  assert.equal(normalizeCookie('  a=1;b=2  '), 'a=1; b=2')
})

test('looksLikeCookie wants a real key=value pair', () => {
  assert.equal(looksLikeCookie('a=1; b=2'), true)
  assert.equal(looksLikeCookie('login_qianwenai_ticket=abc123'), true)
  assert.equal(looksLikeCookie('please work'), false)
  assert.equal(looksLikeCookie('x='), false)
  assert.equal(looksLikeCookie(''), false)
})