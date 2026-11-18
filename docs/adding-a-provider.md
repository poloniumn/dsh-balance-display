# Adding a provider

An adapter is one file in `lib/providers/` plus one line in `lib/registry.js`.
Nothing else in the plugin knows a vendor name: the card renders whatever shape
the host returns.

## 1. Know the shape

Every adapter describes **one** DSH provider id — the key you see under
`providers` in your `llm-pi-ai` config entry.

```js
export default {
  id: 'acme',                 // DSH provider id
  aliases: ['acme-intl'],     // optional: other ids served by the same API
  label: 'Acme',              // shown in the card
  kind: 'money',              // 'money' | 'plan' | 'console' | 'account'
  order: 45,                  // sort position in its section
  secret: { ref: 'ACME_API_KEY', type: 'key' },   // or type 'cookie' / 'account'
  url: 'https://api.acme.dev/v1/user/balance',
  consoleUrl: 'https://acme.dev/console/billing',
  parseKey: (body) => ({ amount: Number(body.balance), currency: 'USD' }),
  setup: {},               // presence = offer a setup form for this credential
}
```

That is the whole adapter for a plain wallet: the host resolves the credential,
does `GET url` with `Authorization: Bearer <key>`, and calls `parseKey`. The
setup row takes its label and credential ref from `label` and `secret.ref`, so
`setup` is only a marker (plus an optional `consoleUrl` override).

### The row fields the card understands

| Field | Meaning |
| --- | --- |
| `amount`, `currency`, `bonus` | wallet rows (`kind: 'money'` / `'account'`) |
| `usedPct`, `remainPct`, `endAt` | plan rows; `remainingDays` is derived |
| `plan` | plan name, rendered as `Vendor · Plan` |
| `windows` | `[{label, usedPct, resetAt}]` — one bar each (OpenCode Go) |
| `todayDelta`, `todayUsedPct` | set by the host from the daily baseline |
| `nightBadges` | `[{discount: '4', models: []}]` — e.g. `夜间 4 折` |
| `nightWindow` | `{startHour, startMinute, endHour, endMinute}` for the pill |
| `peakSchedule` | `{weekdays:[1..5], windows:[{startMinute, endMinute}]}` → dot |
| `keyRef` | credential this row needs; the setup form focuses it |
| `status` | `'ok' \| 'console' \| 'no-key' \| 'expired' \| 'error'` |
| `detail` | short failure text shown on hover |

## 2. When `parseKey` is not enough

Use `fetchSecret(secret, ctx)`. It receives the resolved credential (or nothing
for `kind: 'account'`) and must return a row object. Return `null` to fall back
to the generic key path.

```js
async fetchSecret(key) {
  const body = await getJson('https://api.acme.dev/v1/subscription', key)
  if (!body.ok) return { status: 'expired', detail: body.error }
  return { status: 'ok', plan: body.tier, ...planShape(body.used * 100, body.renewsAt) }
}
```

A `cookie` secret is normalised and format-checked by the host before it reaches
you; the setup page shows the vendor's console link so the user can copy it.
The host **always** reads a cookie adapter's own `secret.ref` — it never follows
the model router's `apiKeyEnv` for a cookie, because the console rejects a
regular API key. Key-backed adapters may follow a renamed profile ref instead.

## 3. A factory, when the adapter keeps state

If the adapter caches something (a scrape timestamp, a discount window), export a
factory instead. `buildAdapters(options)` gives every plugin install its own
instance, so two profiles cannot share a cache:

```js
function createAcmePlan({ cacheDir }) {
  const cache = createCache(cacheDir)          // lib/cache.js
  return { async fetchSecret(key) { /* ... */ } }
}

export default { create: createAcmePlan, id: 'acme-plan', /* base fields */ }
```

Factories are why `lib/registry.js` calls `createAdapterSet(options)` in the
host: the merged object is the adapter, `create` is never leaked.

## 4. Validation in the setup form

If the vendor has a cheap way to check a credential, add it — a wrong paste is
better reported immediately:

```js
async validate(value) {
  const body = await getJson('https://api.acme.dev/v1/me', value)
  return body.ok ? { ok: true } : { ok: false, message: body.error }
}
```

Return `{ ok: false, message }` instead of throwing; the form offers
**Save anyway** only for failures that are not format checks.

## 5. Register it

```js
// lib/registry.js
import acme from './providers/acme.js'
const ALL = [deepseekAccount, deepseek, acme, /* … */ ]
```

Then add a test in `test/providers.test.js` for the parser, and run `npm test`.

## Many plain HTTP vendors at once

For vendors that differ only in endpoint, auth mode and response shape, add a
`SPECS` entry to [lib/providers/vendors.js](../lib/providers/vendors.js)
instead of a file. The shared [lib/upstream.js](../lib/upstream.js) layer
handles 10 s timeouts, `redirect: 'manual'`, a 1 MiB response cap, 3xx handling,
401/403 → `expired` and retryable 408/429/5xx. `options.auth` accepts `bearer`
(default), `raw`, `x-api-key`, `token` and `cookie`; `optional: true` endpoints
degrade silently. `parse` and `check` are pure functions, so they are directly
unit-testable without a network call. The Chinese guide has a fuller example.

## Checklist

- [ ] One file, no vendor name anywhere else.
- [ ] `consoleUrl` set — every row links to the page where the user would top up.
- [ ] `secret.ref` matches the ref DSH already stores (check
      `~/.dsh/.credentials.yaml`), so the user does not have to paste it twice.
- [ ] Failure paths return `status: 'expired' | 'error'` with a short `detail`
      rather than throwing.
- [ ] A parser test with a minimal synthetic payload.
- [ ] Credential tables in both `README.md` and `README.zh-CN.md` updated.