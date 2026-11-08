# Balance display

A DSH plugin that puts one small card under the sidebar and keeps it honest: the
wallet balance of every model provider you have **enabled** in DSH, the usage of
every Token Plan you pay for, and the quota of a few third-party coding
channels. Providers you have not enabled never appear — there is nothing to
configure and nothing to hide by hand.

> 中文说明见 [README.zh-CN.md](README.zh-CN.md)。

## What the card shows

| Section | Rows | Source |
| --- | --- | --- |
| **Token Plan** | Qwen · Lite, MIMO · Lite, OpenCode · Go | the vendor's plan API / console session |
| **Balances** | DeepSeek, MiMo, Kimi, any other wallet provider | `GET <vendor>/balance` with your key |
| **Third-party** | WorkBuddy, Trae, Qoder | the `dsh-connect` plugin, when installed |

Each section folds away when you click its title; the state is remembered per
browser.

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

## Install

```bash
# from this directory
dsh plugin install .
```

Or, inside DSH, point the plugin manager at this folder
(`plugin_manager install_bundle target=<this directory>`). The bundle inserts
one loader row (`dsh-balance-display`) and needs no host-side configuration:
it reads the provider list straight from your `llm-pi-ai` profile record.

Every credential lives in the DSH credential store
(`~/.dsh/.credentials.yaml`) — never in the plugin config, the log, or
`localStorage`.

## Set up the credentials

Rows with no credential show `未配置密钥` / `--`. Click such a row (or its ⚙)
and DSH opens **Settings → Plugins → Balance display**; paste the value there
and press **保存并测试**. The value is validated against the vendor *before* it
is stored, so a wrong paste fails immediately instead of showing an empty row
later.

| Credential | Where to get it |
| --- | --- |
| `DEEPSEEK_API_KEY` | <https://platform.deepseek.com/api_keys> |
| `QWEN_TOKEN_PLAN_COOKIE` | see below — this one is a cookie, not a key |
| `XIAOMI_API_KEY` | <https://platform.xiaomimimo.com/console/api-keys> |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | <https://platform.xiaomimimo.com/console/plan-manage> |
| `OPENCODE_GO_API_KEY` | <https://opencode.ai/console/workspace> |
| `KIMI_API_KEY` | <https://platform.moonshot.cn/console/api-keys> |

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
it is installed.

Provider ids map to adapters in [lib/registry.js](lib/registry.js); a provider
without an adapter still appears as a plain console link. To add a vendor, see
[docs/adding-a-provider.md](docs/adding-a-provider.md) — it is one small file.

## Privacy and network calls

* The host sends a credential only to the URL its adapter declares, always with
  a timeout, never to a URL that came from the browser.
* The state endpoint is fenced to the DSH window: loopback host, loopback (or
  absent) origin, no cross-site `Sec-Fetch-Site`, plus the host's own
  `connection.requestRejection`.
* The write endpoint (`POST /dsh-balance/secret`) accepts one value, validates
  it, and stores it in the DSH credential store. It never returns a secret — the
  setup page only ever sees a mask such as `oc_s…9F (41)`.
* Nothing is fetched from a third party to make the card work except: the vendor
  APIs you configured, two public documentation pages (DeepSeek pricing, MiMo
  plan FAQ) once a day, the Qwen model catalog once a day at the discount
  window's start, and `dsh-connect` on loopback.

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
index.js              host half: routes, provider scan, row building
client.js             sidebar card: sections, setup view, settings tab
lib/providers/*.js    one file per vendor adapter
lib/registry.js       the adapter list
lib/secrets.js        credential store wrapper (read / write / clear / mask)
lib/baseline.js       today's decrease accumulator
lib/schedules.js      daily scrape of the public pricing pages
lib/qwen-discount.js  Qwen night-discount cache
lib/third-party.js    dsh-connect channel reader
lib/http.js           loopback fence + tiny JSON helpers
tools/                the cookie CLI
```

## License

MIT.