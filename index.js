/**
 * dsh-balance-display — host half.
 *
 * Watches the DSH profile for enabled model providers and exposes their wallet
 * balance / plan usage on one loopback JSON endpoint that the sidebar card
 * reads. Rows exist for providers that are enabled AND for any provider the
 * credential store already holds a value for, so a cookie configured on the
 * settings page shows up on the card without touching the profile.
 *
 * Everything is read-only towards the vendors: a resolved credential is sent
 * only to the URL declared by that provider's adapter, never to a user URL.
 *
 * The work lives in ./lib; this file only assembles it.
 */
import os from 'node:os'
import path from 'node:path'

import { createBaseline } from './lib/baseline.js'
import { fileIn } from './lib/cache.js'
import { createCollect } from './lib/collect.js'
import { createCookieSetup } from './lib/cookie-setup.js'
import { sendEmpty, sendJson } from './lib/http.js'
import { createSchedules } from './lib/schedules.js'
import { createSecrets } from './lib/secrets.js'
import { createOfmCredits } from './lib/ofm-credits.js'
import { createAdapterSet } from './lib/registry.js'
import { chooseSecretRef, createRows, secretRefCandidates, selectSetupEntries } from './lib/rows.js'
import { createSnapshot } from './lib/snapshot.js'
import { createFence, createRoutes, fenced, registerRoutes } from './lib/routes.js'
import { fetchThirdParty } from './lib/third-party.js'
import { sharedSetupState } from './lib/peers.js'

/**
 * The credential-shape helpers are public surface: the regression suite pins
 * them and the card's setup spec is derived from them.
 */
export { chooseSecretRef, secretRefCandidates, selectSetupEntries }

export const name = 'dsh-balance-display'
export const inject = ['webServer']

export const ROUTE = '/dsh-balance/state.json'
export const SETTINGS_ROUTE = '/dsh-balance/settings.json'
export const SECRET_ROUTE = '/dsh-balance/secret'
/** Who draws the one credential page; the tab must know before it polls. */
export const PEERS_ROUTE = '/dsh-balance/peers.json'

/** The card's poll cadence; also the default answer cache TTL. */
const CACHE_TTL_MS = 60_000

function homeDir() {
  const override = process.env.DSH_HOME
  return override && override.trim() ? override.trim() : path.join(os.homedir(), '.dsh')
}

const DEFAULT_CACHE_DIR = path.join(homeDir(), 'dsh-balance-display')

/**
 * @param ctx    Cordis context.
 * @param config { cacheDir, refreshSeconds }
 */
export function apply(ctx, config) {
  const options = config || {}
  const cacheDir = options.cacheDir || DEFAULT_CACHE_DIR
  const cacheTtlMs = Number(options.refreshSeconds) > 0
    ? Number(options.refreshSeconds) * 1000
    : CACHE_TTL_MS

  function get(service) {
    try {
      return ctx.get(service)
    } catch {
      return null
    }
  }

  const adapters = createAdapterSet({ cacheDir })
  const secrets = createSecrets({ getService: get })
  const baseline = createBaseline(fileIn(cacheDir, 'baseline.json'))
  const schedules = createSchedules({ cacheDir })
  const ofmCredits = createOfmCredits({ get })
  ctx.effect(() => () => ofmCredits.dispose())

  const rows = createRows({ adapters, secrets, get })
  const collectRows = createCollect({
    adapters,
    rows,
    get,
    schedules,
    baseline,
    fetchThirdParty,
    ofmCredits,
    // The credential store answers "nothing" while it is still loading; saying
    // so keeps that answer out of the cache and off the disk.
    storeReady: () => secrets.available(),
  })

  /**
   * The card polls one payload, so the peer answer rides along with it: when
   * dsh-model-panel is loaded it already draws the shared credential page and
   * this plugin must not draw a second, identical one.
   */
  async function collect(base) {
    const state = await collectRows.collect(base)
    try {
      return { ...state, sharedSetup: sharedSetupState() }
    } catch {
      return state
    }
  }

  const cache = createSnapshot({ cacheDir, collect, cacheTtlMs })
  const cookieSetup = createCookieSetup({ adapters, secrets })
  const denied = createFence({ get })
  const routes = createRoutes({ snapshot: cache.snapshot, cookieSetup })

  /** The tab has to be decided before the card ever polled, so it asks here. */
  function handlePeers(req, res) {
    if (req.method && req.method !== 'GET') return sendEmpty(res, 405)
    return sendJson(res, 200, { ok: true, sharedSetup: sharedSetupState() })
  }

  registerRoutes(ctx, [
    { path: ROUTE, handler: fenced(denied, routes.handleState) },
    { path: SETTINGS_ROUTE, handler: fenced(denied, routes.handleSettings) },
    { path: SECRET_ROUTE, handler: fenced(denied, routes.handleSecret) },
    { path: PEERS_ROUTE, handler: fenced(denied, handlePeers) },
  ])
}
