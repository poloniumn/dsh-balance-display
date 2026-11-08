import test from 'node:test'
import assert from 'node:assert/strict'

import { crossSite, hostIsLoopback, originIsLoopback } from '../lib/http.js'

test('loopback hosts', () => {
  assert.equal(hostIsLoopback('127.0.0.1:3088'), true)
  assert.equal(hostIsLoopback('localhost:8080'), true)
  assert.equal(hostIsLoopback('[::1]:8080'), true)
  assert.equal(hostIsLoopback('example.com'), false)
  assert.equal(hostIsLoopback('127.0.0.1.evil.com'), false)
  assert.equal(hostIsLoopback(undefined), false)
})

test('loopback origins, and an absent origin is fine', () => {
  assert.equal(originIsLoopback('http://127.0.0.1:3088'), true)
  assert.equal(originIsLoopback(undefined), true)
  assert.equal(originIsLoopback(''), true)
  assert.equal(originIsLoopback('https://evil.example'), false)
})

test('cross-site requests are rejected', () => {
  assert.equal(crossSite({ headers: { host: '127.0.0.1:1', origin: 'https://evil.example' } }), true)
  assert.equal(crossSite({ headers: { host: '127.0.0.1:1' } }), false)
})