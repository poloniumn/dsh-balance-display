/**
 * dsh-balance-display — host half.
 *
 * Watches the DSH profile for enabled model providers and exposes their wallet
 * balance / plan usage on one loopback JSON endpoint that the sidebar card
 * reads. Rows exist only for providers that are actually enabled, so the card
 * never has to guess what to hide.
 *
 * Everything is read-only towards the vendors: a resolved credential is sent
 * only to the URL declared by that provider's adapter, never to a user URL.
 */
import os from 'node:os'
import path from 'node:path'

import { createBaseline } from './lib/baseline.js'
import { fileIn } from './lib/cache.js'
import {
  crossSite,
  loopbackBase,
  loopbackRequest,
  readJsonBody,
  sendEmpty,
  sendJson,
} from './lib/http.js'
import { createSchedules } from './lib/schedules.js'
import { createSecrets, looksLikeCookie, normalizeCookie } from './lib/secrets.js'
import { fetchThirdParty } from './lib/third-party.js'
import { createAdapterSet } from './lib/registry.js'
import { errorState, getJson, num } from './lib/util.js'

export const name = 'dsh-balance-display'

export const inject = ['webServer']

/** Public (read-only) state. */
export const ROUTE = '/dsh-balance/state.json'
/** Setup page: which secrets are stored, and their masked state. */
export const SETUP_ROUTE = '/dsh-balance/setup.json'
/** Setup page: write / test / clear one secret. */
export const SECRET_ROUTE = '/dsh-balance/secret'

const CACHE_TTL_MS = 60_000
const DEFAULT_CACHE_DIR = path.join(
  process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
  'dsh-balance-display',
)

export function apply(ctx, config) {
  const cacheDir = (config && config.cacheDir) || DEFAULT_CACHE_DIR
  const cacheTtlMs = Number(config && config.refreshSeconds ? config.refreshSeconds * 1000 : CACHE_TTL_MS)

  // Factories get a cache directory per install, so nothing is shared
  // between two instances of the plugin.
  const adapters = createAdapterSet({ cacheDir })
  const adapterFor = (id) => adapters.get(id)
  const setupAdapters = adapters.all.filter((adapter) => adapter.setup || adapter.secret?.type === 'cookie')

  const secrets = createSecrets({ getService: (key) => get(key) })
  const baseline = createBaseline(fileIn(cacheDir, 'baseline.json'))
  const schedules = createSchedules({ cacheDir })

  function get(key) {
    try { return ctx.get(key) || null } catch { return null }
  }

  let cache = null
  let cacheAt = 0
  let inflight = null

  /** Enabled model providers, read from the live llm-pi-ai config record. */
  function enabledProviders() {
    const ids = new Map() // id -> { displayName, keyRef }
    const editor = get('configEditor')
    if (!editor || typeof editor.configuration !== 'function') return ids
    let rows = []
    try { rows = editor.configuration() || [] } catch { return ids }
    for (const row of rows) {
      const entry = row && row.entry
      const entryName = String((entry && (entry.name || entry.id)) || '')
      if (!entryName.includes('llm-pi-ai')) continue
      for (const layer of [row?.inherited, row?.override, entry?.config]) {
        const providers = layer && typeof layer === 'object' ? layer.providers : null
        if (!providers || typeof providers !== 'object') continue
        for (const [id, profile] of Object.entries(providers)) {
          if (!profile || typeof profile !== 'object') continue
          if (profile.disabled === true) {
            ids.delete(id)
            continue
          }
          const previous = ids.get(id) || {}
          const displayName = typeof profile.displayName === 'string' && profile.displayName.trim()
            ? profile.displayName.trim()
            : previous.displayName || null
          // `apiKeyEnv` is the ref the model router resolves — it wins over the
          // adapter default so a profile that renamed its key keeps working.
          const keyRef = typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.trim()
            ? profile.apiKeyEnv.trim()
            : previous.keyRef || null
          ids.set(id, { displayName, keyRef })
        }
      }
    }
    return ids
  }

  function adapterMeta(adapter, id, meta) {
    return {
      kind: adapter.kind || 'console',
      label: (adapter.labelFor && adapter.labelFor(id)) || adapter.label || meta.displayName || id,
      order: (adapter.orderFor && adapter.orderFor(id)) ?? adapter.order ?? 60,
      consoleUrl: (adapter.consoleUrlFor && adapter.consoleUrlFor(id)) ?? adapter.consoleUrl ?? null,
      secret: (adapter.secretFor && adapter.secretFor(id)) ?? adapter.secret ?? null,
    }
  }

  /** Build one row for one enabled provider. */
  async function buildRow(id, meta) {
    const adapter = adapterFor(id)
    if (!adapter) return fallbackRow(id, meta)
    const shaped = adapterMeta(adapter, id, meta)
    const row = {
      id,
      kind: shaped.kind,
      label: shaped.label,
      order: shaped.order,
      consoleUrl: shaped.consoleUrl,
      status: 'console',
      // Present when this row needs a credential: the setup form focuses it.
      keyRef: shaped.secret?.ref || null,
    }

    // The login-backed wallet needs no credential of its own.
    if (shaped.secret?.type === 'account') {
      try {
        return { ...row, ...(await adapter.fetchSecret(shaped.secret, { account: get('deepseekAccount') })) }
      } catch (err) {
        return { ...row, status: 'error', detail: String((err && err.message) || err).slice(0, 160) }
      }
    }

    if (row.kind === 'console' || !shaped.secret?.ref) return row

    // The profile's own `apiKeyEnv` (and the console cookie, which the profile
    // never stores) win over the adapter default.
    const candidate = meta.keyRef || shaped.secret.ref
    // The profile may have renamed the key; only follow it when it resolves,
    // otherwise the user would be asked for a credential nothing reads.
    const ref = (await secrets.read(candidate)) ? candidate : shaped.secret.ref
    const secret = await secrets.read(ref)
    if (!secret) return { ...row, status: 'no-key', keyRef: ref }

    try {
      if (typeof adapter.fetchSecret === 'function') {
        const result = await adapter.fetchSecret(secret, { account: get('deepseekAccount'), row })
        return { ...row, ...result }
      }
      const result = await getJson((adapter.urlFor && adapter.urlFor(id)) || adapter.url, secret)
      if (!result.ok) return { ...row, ...errorState(result.error) }
      if (row.kind === 'plan') {
        const plan = adapter.parsePlan(result.body)
        if (!plan || (plan.usedPct === null && !Array.isArray(plan.windows))) {
          return { ...row, status: 'error', detail: 'unexpected plan payload' }
        }
        return { ...row, ...plan, status: 'ok' }
      }
      const money = adapter.parseKey(result.body)
      if (!money || num(money.amount) === null) return { ...row, status: 'error', detail: 'unexpected balance payload' }
      return { ...row, status: 'ok', ...money }
    } catch (err) {
      return { ...row, ...errorState((err && err.message) || err) }
    }
  }

  /** An enabled provider this plugin has no adapter for: a console link only. */
  function fallbackRow(id, meta) {
    return {
      id,
      kind: 'console',
      label: meta.displayName || id,
      order: 60,
      consoleUrl: null,
      status: 'console',
      keyRef: meta.keyRef || null,
    }
  }

  async function collect(base) {
    const ids = enabledProviders()

    // The DeepSeek wallet is readable straight from the DSH login.
    const account = adapterFor('deepseek-account')
    if (account && await account.available(get('deepseekAccount'))) {
      ids.set('deepseek-account', { displayName: 'DeepSeek', keyRef: null })
    }

    const built = await Promise.all([...ids.entries()].map(([id, meta]) => buildRow(id, meta)))

    // One DeepSeek row: when the login-backed wallet answers, a keyed row that
    // has no key of its own is redundant.
    const accountRow = built.find((row) => row.id === 'deepseek-account')
    const rows = built.filter((row) => {
      if (row.id !== 'deepseek') return true
      return !(accountRow && accountRow.status === 'ok' && row.status === 'no-key')
    })

    for (const row of rows) {
      if (row.status !== 'ok') continue
      if (row.kind === 'plan' && typeof row.usedPct === 'number') {
        const today = baseline.sample(row.id, row.usedPct, false, 10)
        if (today > 0) row.todayUsedPct = today
      }
      if ((row.kind === 'money' || row.kind === 'account') && typeof row.amount === 'number') {
        const today = baseline.sample(row.id, row.amount, true, 100)
        if (today > 0) row.todayDelta = today
      }
    }
    baseline.flush()

    // An empty wallet says nothing the user needs to see; a negative balance
    // (owed) still does.
    const visible = rows.filter((row) => !(
      (row.kind === 'money' || row.kind === 'account')
      && row.status === 'ok'
      && row.amount === 0
    ))

    const state = { schedules: await schedules.current() }
    for (const row of visible) {
      const adapter = adapterFor(row.id)
      if (adapter && typeof adapter.meta === 'function') {
        try { adapter.meta(row, state) } catch { /* metadata is cosmetic */ }
      }
    }

    visible.sort((a, b) => (a.order - b.order) || String(a.label).localeCompare(String(b.label)))
    const thirdParty = await fetchThirdParty(base)
    return { ok: true, updatedAt: Date.now(), rows: visible, thirdParty }
  }

  async function snapshot(force, base) {
    if (cache && !force && Date.now() - cacheAt < cacheTtlMs) return cache
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const next = await collect(base)
        cache = next
        cacheAt = Date.now()
        return next
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  /** Closed when the host says the peer may not call us, or it is cross-site. */
  function denied(req) {
    try {
      if (crossSite(req) || !loopbackRequest(req)) return 403
      const connection = get('connection')
      if (connection && typeof connection.requestRejection === 'function') {
        const code = connection.requestRejection(req)
        if (code !== undefined && code !== null && code !== false) {
          return typeof code === 'number' ? code : 403
        }
      }
      return null
    } catch {
      return 403
    }
  }

  async function handleState(req, res) {
    if (denied(req)) return sendEmpty(res, 403)
    const url = new URL(req.url || '/', 'http://localhost')
    const force = url.searchParams.get('refresh') === '1'
    try {
      const payload = await snapshot(force, loopbackBase(req.headers && req.headers.host))
      sendJson(res, 200, payload)
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
    }
  }

  function setupSpec() {
    return setupAdapters.map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      kind: adapter.kind,
      ref: adapter.secret.ref,
      type: adapter.secret.type,
      consoleUrl: adapter.setup?.consoleUrl || adapter.consoleUrl || null,
      help: adapter.setup?.help || null,
    }))
  }

  async function handleSetup(req, res) {
    if (denied(req)) return sendEmpty(res, 403)
    try {
      const specs = setupSpec()
      const status = await secrets.status(specs.map((spec) => spec.ref))
      sendJson(res, 200, {
        ok: true,
        entries: specs.map((spec) => ({ ...spec, ...(status[spec.ref] || { set: false }) })),
      })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
    }
  }

  async function handleSecret(req, res) {
    if (denied(req)) return sendEmpty(res, 403)
    const body = await readJsonBody(req)
    if (!body) return sendJson(res, 400, { ok: false, error: 'bad request' })
    const adapter = setupAdapters.find((candidate) => candidate.id === body.id)
    if (!adapter) return sendJson(res, 404, { ok: false, error: 'unknown provider' })
    const ref = adapter.secret.ref

    try {
      if (body.action === 'clear') {
        await secrets.clear(ref)
        cache = null
        return sendJson(res, 200, { ok: true, set: false })
      }

      let value = String(body.value || '')
      if (adapter.secret.type === 'cookie') {
        value = normalizeCookie(value)
        if (!looksLikeCookie(value)) {
          return sendJson(res, 400, { ok: false, error: 'that does not look like a Cookie header' })
        }
      } else {
        value = value.trim()
        if (value.length < 8) return sendJson(res, 400, { ok: false, error: 'key looks too short' })
      }

      const check = typeof adapter.validate === 'function'
        ? await adapter.validate(value).catch((err) => ({ ok: false, message: String((err && err.message) || err) }))
        : await adapter.setupHint?.({ key: value, ref }).catch((err) => ({ ok: false, message: String((err && err.message) || err) }))
      if (check && check.ok === false && body.force !== true) {
        return sendJson(res, 200, { ok: false, saved: false, error: check.message || 'this credential was rejected' })
      }

      await secrets.write(ref, value)
      cache = null
      cacheAt = 0
      return sendJson(res, 200, { ok: true, saved: true, plan: check && check.plan ? check.plan : null, set: (await secrets.status([ref]))[ref] })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
    }
  }

  ctx.inject(['webServer'], (inner) => {
    const routes = [
      { path: ROUTE, handler: handleState },
      { path: SETUP_ROUTE, handler: handleSetup },
      { path: SECRET_ROUTE, handler: handleSecret },
    ]
    for (const route of routes) {
      inner.effect(() => {
        const dispose = inner.webServer.register({ kind: 'exact', path: route.path, handler: route.handler })
        return () => { dispose() }
      }, `route:${route.path}`)
    }
  })
}