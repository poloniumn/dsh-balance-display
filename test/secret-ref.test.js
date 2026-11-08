import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseSecretRef } from '../index.js'
import { adapterFor } from '../lib/registry.js'

test('a cookie adapter ignores the profile apiKeyEnv', () => {
  // The Qwen model router uses QWEN_TOKEN_PLAN_CN_API_KEY, but the console
  // gateway needs the browser cookie. Sending the key answers NotLogined.
  const qwen = adapterFor('qwen-token-plan-cn')
  assert.equal(qwen.secret.type, 'cookie')
  assert.equal(chooseSecretRef(qwen.secret, 'QWEN_TOKEN_PLAN_CN_API_KEY'), 'QWEN_TOKEN_PLAN_COOKIE')
})

test('a key adapter may follow a renamed profile ref', () => {
  const xiaomi = adapterFor('xiaomi')
  assert.equal(xiaomi.secret.type, 'key')
  assert.equal(chooseSecretRef(xiaomi.secret, 'MY_CUSTOM_XIAOMI_KEY'), 'MY_CUSTOM_XIAOMI_KEY')
  assert.equal(chooseSecretRef(xiaomi.secret, null), 'XIAOMI_API_KEY')
  assert.equal(chooseSecretRef(xiaomi.secret, ''), 'XIAOMI_API_KEY')
})
