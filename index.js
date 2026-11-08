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

/**
 * The primary credential reference for one row. A cookie-backed adapter must
 * always use its own console cookie — never the model router's `apiKeyEnv`
 * (a regular API key), which the console gateway rejects with
 * `BailianGateway.Login.NotLogined`. Key-backed adapters may follow a renamed
 * profile ref. `secretRefCandidates` below expands this into the full ordered
 * list the host actually tries; this one is kept for the cookie-vs-key rule's
 * regression test and for callers that only need one name.
 */
export function chooseSecretRef(secret, profileRef) {
  if (secret.type === 'cookie') return secret.ref
  return profileRef || secret.ref
}

/**
 * Every name a key may be stored under, in priority order. Some vendors have
 * two accepted ref names (e.g. OpenCode Go's dedicated key and the Zen key),
 * and a profile can rename its key through `apiKeyEnv`. Names are tried one
 * at a time against the credential store — never merged across sources.
 * Cookies stay pinned to their own console ref.
 */
export function secretRefCandidates(secret, profileRef) {
  if (!secret || secret.type === 'account') return []
  if (secret.type === 'cookie') return [secret.ref]
  const refs = []
  const push = (ref) => { if (ref && !refs.includes(ref)) refs.push(ref) }
  push(profileRef)
  push(secret.ref)
  for (const alias of secret.aliases || []) push(alias)
  return refs
}

/**
 * Which credential rows the setup page should offer. The full catalogue is
 * two dozen vendors, most of which this profile will never enable; rendering
 * all of them buries the form and pushes the settings dialog off screen.
 * Default: adapters behind providers enabled in DSH, plus any adapter with a
 * stored credential (so a key can still be cleared after its provider is
 * switched off). `includeAll` opts into the whole catalogue.
 */
export function selectSetupEntries(specs, activeIds, status, includeAll = false) {
  const active = activeIds instanceof Set ? activeIds : new Set(activeIds || [])
  const known = status || {}
  return specs
    .map((spec) => {
      // One credential can live under several ref names (a renamed profile
      // ref, the vendor default, aliases). The host tries them in order, so
      // the setup row is "configured" when ANY of them is stored — otherwise a
      // disabled vendor with an aliased key would vanish and could not be
      // cleared.
      let state = { set: false }
      for (const ref of spec.refs || [spec.ref]) {
        const found = known[ref]
        if (found && found.set) { state = { ...found }; break }
      }
      return { ...spec, ...state, enabled: active.has(spec.id) }
    })
    .filter((entry) => includeAll || entry.enabled || entry.set)
}

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

  /** Adapter ids behind the model providers currently enabled in DSH. */
  function activeAdapterIds() {
    const ids = new Set()
    for (const providerId of enabledProviders().keys()) {
      const adapter = adapterFor(providerId)
      if (adapter) ids.add(adapter.id)
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

    // Cookie-backed adapters read their own console cookie, NOT the model
    // router's `apiKeyEnv`: a plan like Qwen needs the browser session, while
    // the profile may point `apiKeyEnv` at a regular API key. Sending that key
    // to the console gateway answers `BailianGateway.Login.NotLogined`.
    // For key-backed adapters the profile may have renamed the key; only follow
    // it when it actually resolves, otherwise fall back to the adapter default.
    const candidates = secretRefCandidates(shaped.secret, meta.keyRef)
    let ref = candidates[0] || shaped.secret.ref
    let secret = null
    for (const candidate of candidates) {
      const value = await secrets.read(candidate)
      if (value) { ref = candidate; secret = value; break }
    }
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

  /** Refs renamed by the live `llm-pi-ai` profile, keyed by adapter id. */
  function profileRefsByAdapter() {
    const byAdapter = new Map()
    for (const [id, meta] of enabledProviders()) {
      const adapter = adapterFor(id)
      if (!adapter || !meta.keyRef) continue
      const list = byAdapter.get(adapter.id) || []
      list.push(meta.keyRef)
      byAdapter.set(adapter.id, list)
    }
    return byAdapter
  }

  /**
   * Setup rows must describe the SAME credential names `buildRow` tries:
   * renamed profile ref first, then the vendor default, then aliases. Only
   * then do the card, the setup list and "clear" agree on what "configured"
   * means for a provider that is not enabled.
   */
  function setupSpec() {
    const renamed = profileRefsByAdapter()
    return setupAdapters.map((adapter) => {
      const refs = []
      const push = (ref) => { if (ref && !refs.includes(ref)) refs.push(ref) }
      for (const ref of renamed.get(adapter.id) || []) push(ref)
      push(adapter.secret.ref)
      for (const alias of adapter.secret.aliases || []) push(alias)
      return {
        id: adapter.id,
        label: adapter.label,
        kind: adapter.kind,
        ref: refs[0],
        refs,
        type: adapter.secret.type,
        consoleUrl: adapter.setup?.consoleUrl || adapter.consoleUrl || null,
      }
    })
  }

  async function handleSetup(req, res) {
    if (denied(req)) return sendEmpty(res, 403)
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const includeAll = url.searchParams.get('all') === '1'
      const specs = setupSpec()
      const status = await secrets.status([...new Set(specs.flatMap((spec) => spec.refs))])
      sendJson(res, 200, {
        ok: true,
        entries: selectSetupEntries(specs, activeAdapterIds(), status, includeAll),
        total: specs.length,
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
    const spec = setupSpec().find((candidate) => candidate.id === body.id)
    const ref = spec ? spec.ref : adapter.secret.ref
    const refs = spec ? spec.refs : [ref]

    try {
      if (body.action === 'clear') {
        // A key may have been stored under an older alias; clear every name
        // the host would try, otherwise the row stays configured.
        await Promise.all(refs.map((name) => secrets.clear(name)))
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
      const after = await secrets.status(refs)
      const stored = Object.values(after).find((entry) => entry.set) || { set: false }
      return sendJson(res, 200, { ok: true, saved: true, plan: check && check.plan ? check.plan : null, set: stored })
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
      // `register` returns the disposer itself; wrapping it in another arrow
      // would turn an undefined return into a TypeError on unload / HMR.
      inner.effect(() => inner.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }), `route:${route.path}`)
    }
  })
}