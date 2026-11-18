# Changelog

## 2.1.0

The host half is now seven small modules instead of one 495-line file, and the
balance/usage pipeline is the same one `dsh-model-panel` runs.

### Changed

- `index.js` only assembles: `lib/rows.js`, `lib/collect.js`, `lib/snapshot.js`,
  `lib/routes.js`, `lib/cookie-setup.js`, `lib/cookie-import.js`, `lib/peers.js`.
- Rows are built for the providers enabled **and** for any provider the
  credential store already holds a value for, so a cookie typed on the settings
  page shows up without touching the profile.
- Credentials are probed concurrently, fall back to `process.env`, try the
  canonical `ID_API_KEY` name, and support an adapter's `secret.extras`
  (a control key plus a console cookie, say).
- Answers are cached for 60 s, served stale for up to 30 min while refreshing,
  and seeded from `last-state.json`; a degraded answer (credential store not
  ready) never overwrites the cache.
- `?refresh=1` on `/dsh-balance/state.json` still forces a fetch.
- The credential page takes a whole Cookie-Editor JSON export, a Netscape
  `cookies.txt`, or a raw `Cookie:` header, and files can be dropped onto the
  box. Values are validated against the vendor before they are stored.
- Providers: DeepSeek notes a depleted balance, `deepseek-account` buckets by
  currency (CNY first), MIMO reads the console trio `/balance`,
  `/tokenPlan/detail`, `/tokenPlan/usage`, Qwen fetches subscription and usage
  in parallel, MiMo and Xiaomi pick the same fields in the same order.

### Added

- `lib/peers.js`: the one credential page is drawn by `dsh-model-panel` when the
  profile actually loads it; otherwise this plugin registers the same page in
  the same place with the same wording. `/dsh-balance/peers.json` answers the
  question, and `state.json` carries a `sharedSetup` copy.
- `last-state.json` in the cache directory as the on-disk seed.

### Removed

- The compact in-card form (pasting a key from a folded card), the
  `/dsh-balance/setup.json` endpoint, 6 unreferenced style keys and 28
  unreferenced wording keys.

## 2.0.0

First public release. Adapter-based vendor contracts, the three-section sidebar
card with fold memory, the Qwen/MiMo console-session path, the third-party
channel rows, and the credential page under Settings → Plugins.
