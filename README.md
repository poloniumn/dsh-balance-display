# Balance display

A DSH plugin that puts one small card under the sidebar and keeps it honest: the
wallet balance of every model provider you have **enabled** in DSH, the usage of
every Token Plan you pay for, and the quota of a few third-party coding
channels. Providers you have not enabled never appear, and there is nothing to
hide by hand.

> 中文说明见 [README.zh-CN.md](README.zh-CN.md)。 Release history:
> [CHANGELOG.md](CHANGELOG.md).

## What the card shows

| Section | Rows | Source |
| --- | --- | --- |
| **Token Plan** | Qwen · Lite, MIMO · Lite, OpenCode · Go, Z.ai, MiniMax… | the vendor's plan API / console session |
| **Balances** | DeepSeek, MiMo, Kimi, SiliconFlow… | each vendor's own endpoint (auth, endpoint count and units differ) |
| **Third-party** | WorkBuddy, Trae, Qoder · LobsterAI, Qoder 中国版, TRAE, Cline, Loomy, Raccoon, MiniMax Code, ZCode, Gemini | the `dsh-connect` plugin and our Free Model's **EAC router** page, each when installed |

All three sections start folded; click a title to open just that one. The state
is remembered per browser, and folding all three at once is allowed. The card has
no settings gear in its header — configuration lives in **Settings → Plugins →
Balance display**. A row missing a credential stays clickable, and an empty card
offers a **Configure key** button, so setup is still reachable if the settings
dialog is unavailable.

## One settings page, shared with dsh-model-panel

Both plugins read the same console cookies, so the credential page exists once.
The host reads the local profile's `package.json` (`dependencies` and
`dsh.profile.bundles`) to learn whether `dsh-model-panel` is actually loaded:

* **Installed and bundled** — that plugin's page is the only tab; this plugin
  registers nothing, so two identical pages never appear side by side.
* **Absent or not bundled** — this plugin registers the page in the same place
  (`Settings → Plugins`) with the same content and wording, so setup works
  either way.

The answer comes from `/dsh-balance/peers.json` (`state.json` carries a
`sharedSetup` copy too) and is cached in `localStorage`, so it is asked once.

A few details that make the card readable at a glance:

* **Today's decrease** — a yellow `-¥0.42` before the amount is how much that
  wallet lost since midnight. A top-up is *not* counted as an increase; it only
  resets the anchor, so a refund never eats a day of consumption.
* **Colour** — a CNY balance below `10` turns amber, below `1` (negatives
  included) turns red.
* **Plan rows** — the plan name follows the vendor (`Qwen · Lite`), the yellow
  `↑4%` is the share of the plan used today, and the bar is this period's usage
  with the days left.
* **Night discounts** — while a vendor's discounted window is open, a green
  `夜间 4 折` pill appears beside the plan name, with the models the discount
  covers. Qwen's window and rates are scraped from the model catalog once a day;
  MiMo's from the public Token Plan FAQ.
* **Peak hours** — the green/red dot after DeepSeek and MiMo balances means
  off-peak / peak right now; hovering says when the next switch is.
* **EAC router credits** — each channel of our Free Model's EAC router page gets
  a row with what is left: `剩余积分 1.2K`, `剩余余额（USD） $3.50`, `剩余 Token`,
  or `剩余配额` with the package bar. Gemini's quota is never summed into a
  balance (its `total` adds percentages across model pools), and a channel
  without configured accounts is left out instead of showing a zero.

## Install

From this checkout:

```bash
dsh plugin install .
```

From the published package:

```bash
dsh plugin install dsh-balance-display
```

Or, inside DSH, point the plugin manager at either
(`plugin_manager install_bundle target=<dir or package>`). The bundle inserts
one loader row (`dsh-balance-display`) and needs no host-side configuration:
it reads the provider list straight from your `llm-pi-ai` profile record.
Restart DSH after installing or upgrading — the host half and the sidebar card
are both loaded once, at boot.

Every credential lives in the DSH credential store
(`~/.dsh/.credentials.yaml`) — never in the plugin config, the log, or
`localStorage`.

## Set up the credentials

Rows with no credential show `未配置密钥` / `--`. Click such a row and DSH
opens **Settings → Plugins → Balance display**; paste the value there
and press **保存并测试**. The value is validated against the vendor *before* it
is stored, so a wrong paste fails immediately instead of showing an empty row
later.

The setup page is a whole tab, not a dialog. Every credential the plugin knows
about gets its own card, grouped by kind (Token Plan cookies first, then the
wallets), and each card carries the masked value, the vendor console link, the
balance or plan usage it just read, and one paste box. A Cookie-Editor JSON
export, a Netscape `cookies.txt`, and the raw `Cookie:` header all work, and a
file can be dropped onto the box instead of pasted. Nothing is stored until the
value passes the vendor check, so a wrong paste fails on the spot.

| Credential | Where to get it |
| --- | --- |
| `DEEPSEEK_API_KEY` | <https://platform.deepseek.com/api_keys> |
| `QWEN_TOKEN_PLAN_COOKIE` | see below — a console cookie, not a key |
| `XIAOMI_API_KEY` | <https://platform.xiaomimimo.com/console/api-keys> |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | <https://platform.xiaomimimo.com/console/plan-manage> |
| `OPENCODE_GO_API_KEY` (or `OPENCODE_API_KEY`) | <https://opencode.ai/console/workspace> |
| `ZAI_CODING_CN_API_KEY` / `ZAI_CODING_API_KEY` | Z.ai China / International — **different auth modes** |
| `OPENROUTER_API_KEY` | <https://openrouter.ai/settings/keys> |
| `SILICONFLOW_API_KEY`, `NOVITA_API_KEY`, `HYPERBOLIC_API_KEY`, `DEEPINFRA_API_KEY`, `AI_GATEWAY_API_KEY` | each vendor's API keys page |
| `NANOGPT_API_KEY`, `SYNTHETIC_API_KEY`, `CHUTES_API_KEY`, `OLLAMA_API_KEY`, `APIGOTO_API_KEY` | each vendor's API keys page |
| `MINIMAX_CN_API_KEY` / `MINIMAX_API_KEY` | MiniMax China / International |
| `ZENMUX_MANAGEMENT_API_KEY` | ZenMux **Management** key (an inference key cannot read quota) |

Kimi / Moonshot (`KIMI_API_KEY`, `MOONSHOT_API_KEY`) reuse the key already
held by the DSH model router, so they have no row on this setup page.

### The Alibaba (Qwen Token Plan) cookie

Qwen has no API for plan usage: the numbers only exist behind the
`platform.qianwenai.com` console session. So the plugin stores your console
`Cookie` header.

1. Sign in at <https://platform.qianwenai.com/home/billing/subscription/token-plan>.
2. DevTools → **Network** → pick any request to `platform.qianwenai.com`.
3. Copy the whole `Cookie` request header.
4. DSH → Settings → Plugins → Balance display → **Qwen Token Plan console
   cookie** → paste → **保存并测试**.

The cookie lasts about a week. When the row says `登录已过期`, copy a fresh one.

Prefer a terminal? The same thing without the UI:

```bash
npx dsh-balance-qwen-cookie --paste     # hidden prompt, validates before writing
npx dsh-balance-qwen-cookie --from-copy # straight from the clipboard
npx dsh-balance-qwen-cookie --check     # what is stored, and is it still valid
npx dsh-balance-qwen-cookie --remove
```

## Which providers appear

Only what your DSH profile actually enables. The plugin reads the `providers`
record of the `llm-pi-ai` config entry (and its inherited/override layers) and
keeps the entries that are not `disabled`. The DSH login itself supplies
`deepseek-account`; the `dsh-connect` plugin supplies the third-party rows when
it is installed, and our Free Model supplies the credits of its **EAC router**
channels when it is installed.

Provider ids map to adapters in [lib/registry.js](lib/registry.js); a provider
without an adapter still appears as a plain console link. To add a vendor, see
[docs/adding-a-provider.md](docs/adding-a-provider.md) — it is one small file.

## How the numbers are fetched

`GET + Authorization: Bearer` does not describe every vendor. The shared
request layer in [lib/upstream.js](lib/upstream.js) now owns the wire protocol,
and adapters in [lib/providers/vendors.js](lib/providers/vendors.js) declare
only endpoints, an auth mode and a pure `parse` function. The vendor contracts
were derived from `dsh-subusage` 0.24.5 (MIT; see [NOTICE](NOTICE)), whose
adapters were checked against live accounts:

* **Bare `Authorization`** (no `Bearer`) — Z.ai International, Ollama Cloud.
* **`x-api-key` + `POST {}`** — the NanoGPT balance endpoint, which also uses a
  different host for management keys.
* **Cookie sessions** — Qwen / MiMo consoles, with Origin/Referer headers.
* **Two endpoints with silent degradation** — OpenRouter (`/key` works with any
  key; `/credits` is management-only and 403s), ZenMux, Kimi, NanoGPT. A
  secondary failure drops only the secondary information, never the row.
* **Business errors inside HTTP 200** — MiniMax `base_resp.status_code`.
* **Per-vendor units** — Novita is 1/10000 USD, Hyperbolic is cents, DeepInfra
  is a *negative* balance, Vercel is a decimal string.
* **Two names for one credential** — OpenCode Go accepts `OPENCODE_GO_API_KEY`
  and falls back to `OPENCODE_API_KEY`, tried one at a time.

Calls through that shared layer get a 10 s timeout, `redirect: 'manual'`, a 1 MiB
response cap; 3xx is not an auth failure, 401/403 → `expired`, 408/429/5xx are
retryable, and a non-JSON response is treated as a stale session. The generic
`getJson` helper still used by a few hand-written adapters has an 8 s timeout.
`kimi-coding` probes the subscription endpoint first (4 s timeout) and falls
back to the Moonshot wallet, so a key from either platform produces a row.
Z.ai and OpenRouter, which used to be console links only, now read real quota
and balance data.

The EAC router channels are a different animal: our Free Model exposes no HTTP
route for them at all, so [lib/ofm-credits.js](lib/ofm-credits.js) calls the
same `usage.badge` method it calls itself — through the host's in-process
Connection (`createPeer` + `createSharedFetchHandler('/api')`), because a bare
loopback `fetch` to `/api/*` carries no session and is refused by the gateway.
`usage.badge` is preferred over `credits.balances` because it is cached by the
host and only covers enabled accounts, so the card's minute-long poll does not
multiply upstream requests.

Vendors that need a local OAuth file, a QR login or IAM request signing (Grok,
Codex, GitHub Copilot, Volcengine, Command Code) are intentionally not ported:
they depend on the host's login / credential-record services.

## Privacy and network calls

* The host sends a credential only to the URL its adapter declares, always with
  a timeout, never to a URL that came from the browser.
* The state endpoint is fenced to the DSH window: loopback host, loopback (or
  absent) origin, no cross-site `Sec-Fetch-Site`, plus the host's own
  `connection.requestRejection`.
* The write endpoint (`POST /dsh-balance/secret`) accepts one value, validates
  it, and stores it in the DSH credential store. It never returns a secret — the
  setup page only ever sees a mask such as `oc_…9F (41)`.
* Nothing is fetched from a third party to make the card work except: the vendor
  APIs you configured, two public documentation pages (DeepSeek pricing, MiMo
  plan FAQ) once a day, the Qwen model catalog once a day at the discount
  window's start, `dsh-connect` on loopback, and our Free Model's own
  `/api/channel-pack` through the host's in-process Connection (never over the
  network, and only the `usage.badge` read it already caches).

## Data files

Caches live in `<DSH_HOME>/dsh-balance-display/` (by default `~/.dsh/…`):

| File | Content |
| --- | --- |
| `baseline.json` | today's anchor per row, used for the yellow "today" numbers |
| `schedules.json` | peak / night windows scraped from the public pages |
| `qwen-discount.json` | the Qwen discount badges and when they were read |

Delete the directory to start from scratch; the card rebuilds it.

## Development

```bash
npm test    # node --test, no dependencies
```

Layout:

```
index.js              host half: assembles the pieces below, exports four routes
client.js             sidebar card: sections, shared settings tab
lib/providers/*.js    one file per vendor adapter
lib/registry.js       the adapter list
lib/rows.js           one provider -> one row (credential probe, extras, meta)
lib/collect.js        the enabled-provider scan and the whole state payload
lib/snapshot.js       answer cache, stale-while-revalidate, on-disk seed
lib/routes.js         the loopback fence and the three JSON handlers
lib/cookie-setup.js   the credential page, host half (paste, import, validate)
lib/cookie-import.js  Cookie-Editor / Netscape / header parsing
lib/peers.js          is dsh-model-panel loaded, i.e. who owns the settings tab
lib/secrets.js        credential store wrapper (read / write / clear / mask)
lib/baseline.js       today's decrease accumulator
lib/schedules.js      daily scrape of the public pricing pages
lib/qwen-discount.js  Qwen night-discount cache
lib/third-party.js    dsh-connect channel reader
lib/ofm-credits.js    our Free Model EAC router credit reader
lib/http.js           loopback fence + tiny JSON helpers
tools/                the cookie CLI
```

## Credits

The vendor API contracts were derived from
[dsh-subusage 0.24.5](https://github.com/KouzakiUmi/dsh-subusage) by
KouzakiUmi (MIT). The required attribution is kept in [NOTICE](NOTICE).

## License

MIT — see [LICENSE](LICENSE).