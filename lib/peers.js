/**
 * Peer detection: is another DSH plugin already providing the shared
 * credential settings page?
 *
 * The balance card and the model panel read the same console cookies, so they
 * share one settings page rather than shipping two identical tabs. The host
 * half of each plugin answers "is my peer installed" here, from the profile
 * manifests that make a plugin part of the running tree — not from the
 * `~/.dsh/<plugin>` directories, which only ever hold runtime state.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The plugin that owns the shared page when it is present. */
export const SETUP_PEER = 'dsh-model-panel'

function dshHome() {
  const override = process.env.DSH_HOME
  return override && override.trim() ? override.trim() : path.join(os.homedir(), '.dsh')
}

/** Read one profile's manifest, or null when it is not a readable profile. */
function readProfile(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Every profile that declares the peer — in `dependencies` (installed) or in
 * `dsh.profile.bundles` (actually loaded into the plugin tree). Both are
 * checked because a plugin can be installed and not bundled, and a bundle entry
 * can name a built-in that is never a dependency.
 */
export function detectPeers({ home = dshHome(), peer = SETUP_PEER } = {}) {
  const found = { installed: false, bundled: false, profiles: [] }
  let entries = []
  try {
    entries = fs.readdirSync(path.join(home, 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return found
  }
  for (const name of entries) {
    const pkg = readProfile(path.join(home, 'profiles', name))
    if (!pkg) continue
    const deps = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}
    const bundles = Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : []
    const declared = Object.prototype.hasOwnProperty.call(deps, peer)
    const loaded = bundles.includes(peer)
    if (!declared && !loaded) continue
    found.profiles.push(name)
    if (declared) found.installed = true
    if (loaded) found.bundled = true
  }
  return found
}

/**
 * The answer the browser needs: whether the peer will draw the settings tab,
 * so this plugin can stay out of the way. `ownsSetupTab` requires the peer to
 * be loaded, not merely installed — an installed-but-unbundled plugin never
 * registers a tab.
 */
export function sharedSetupState(options) {
  const peers = detectPeers(options)
  return {
    peer: SETUP_PEER,
    installed: peers.installed,
    bundled: peers.bundled,
    profiles: peers.profiles,
    ownsSetupTab: peers.bundled,
  }
}
