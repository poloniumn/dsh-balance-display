# 新增一家厂商

适配器就是 `lib/providers/` 里的一个文件，加 `lib/registry.js` 里一行注册。
插件里其它任何地方都不认识厂商名：卡片只渲染宿主返回的字段。

## 1. 最小适配器

适配器描述**一个** DSH 服务商 id——也就是你 `llm-pi-ai` 配置里
`providers` 下的键。

```js
export default {
  id: 'acme',                 // DSH 服务商 id
  aliases: ['acme-intl'],     // 可选：同一 API 的其它 id
  label: 'Acme',              // 卡片里显示的名字
  kind: 'money',              // 'money' | 'plan' | 'console' | 'account'
  order: 45,                  // 区块内排序
  secret: { ref: 'ACME_API_KEY', type: 'key' },   // 或 type 'cookie' / 'account'
  url: 'https://api.acme.dev/v1/user/balance',
  consoleUrl: 'https://acme.dev/console/billing',
  parseKey: (body) => ({ amount: Number(body.balance), currency: 'USD' }),
  setup: {},               // 存在即在设置页提供表单
}
```

这就是一个钱包型厂商的全部：宿主解析凭据、`GET url`（`Authorization: Bearer`），
再调 `parseKey`。设置行的名称与凭据引用名来自 `label` 和 `secret.ref`，`setup`
只作标记（可选 `consoleUrl` 覆盖控制台链接），不读 `label` / `ref` 字段。

### 卡片认得的行字段

| 字段 | 含义 |
| --- | --- |
| `amount`、`currency`、`bonus` | 钱包行（`kind: 'money'` / `'account'`） |
| `usedPct`、`remainPct`、`endAt` | 套餐行；`remainingDays` 由插件推导 |
| `plan` | 套餐名，渲染为「厂商 · 套餐」 |
| `windows` | `[{label, usedPct, resetAt}]`，每条一个进度条（OpenCode Go） |
| `notes` | 字符串数组，渲染成一行小字（钱包副余额、套餐到期、累计花费等） |
| `kind` | `fetchSecret` 的返回值可以覆盖它，用于「订阅接口失败就回落钱包」这类动态行 |
| `todayDelta`、`todayUsedPct` | 由宿主按当日基准计算，适配器不用填 |
| `nightBadges` | `[{discount: '4', models: []}]`，即 `夜间 4 折` |
| `nightWindow` | `{startHour, startMinute, endHour, endMinute}`，控制标签显示时段 |
| `peakSchedule` | `{weekdays:[1..5], windows:[…]}`，控制高峰圆点 |
| `keyRef` | 该行需要的凭据，配置表单会聚焦它 |
| `status` | `'ok' \| 'console' \| 'no-key' \| 'expired' \| 'error'` |
| `detail` | 悬停显示的简短失败原因 |

## 2. `parseKey` 不够用时

用 `fetchSecret(secret, ctx)`。它拿到已解析的凭据（`kind: 'account'` 时没有凭
据），必须返回一个行对象；返回 `null` 则回落到通用密钥流程。

```js
async fetchSecret(key) {
  const body = await getJson('https://api.acme.dev/v1/subscription', key)
  if (!body.ok) return { status: 'expired', detail: body.error }
  return { status: 'ok', plan: body.tier, ...planShape(body.used * 100, body.renewsAt) }
}
```

`cookie` 类型的凭据由宿主先规范化并做格式检查，再交给你；配置页会显示厂商控制台
链接，方便用户复制。宿主**始终**读取 cookie 适配器自己的 `secret.ref`，不会跟着
模型路由的 `apiKeyEnv` 走——控制台不接受普通 API Key。只有密钥类适配器才允许
跟随 profile 里改过名的 ref。

### 多端点、非 Bearer 鉴权、部分失败降级

`lib/upstream.js` 提供 `requestJson(url, options)`，返回
`{ ok, body, error, status, authFailed, retryable }`，永不抛异常：

```js
import { requestJson, optionalJson, requestError, windowRow, decimal } from '../upstream.js'

const keyResult = await requestJson('https://vendor.dev/v1/key', { key })
if (!keyResult.ok) return requestError(keyResult)          // 401 → expired
const credits = await optionalJson('https://vendor.dev/v1/credits', { key }) // 403 → undefined
```

`options.auth` 支持 `bearer`（默认）、`raw`（裸 `Authorization`）、`x-api-key`、
`token`、`cookie`；`method` / `body` / `headers` 原样透传。护栏是统一的：10 秒
超时、`redirect: 'manual'`、1 MiB 上限、3xx 不算鉴权失败、401/403 →
`authFailed`、408/429/5xx → `retryable`。

一次性加好几家**纯 HTTP** 厂商时，更省事的是往
[lib/providers/vendors.js](../lib/providers/vendors.js) 的 `SPECS` 添一条：

```js
{
  id: 'acme', label: 'Acme', order: 68, ref: 'ACME_API_KEY',
  consoleUrl: 'https://acme.dev/billing',
  endpoints: [
    { name: 'usage', url: 'https://acme.dev/v1/usage', auth: 'raw' },
    { name: 'wallet', url: 'https://acme.dev/v1/wallet', optional: true },
  ],
  parse: ({ usage, wallet }) => ({ kind: 'money', amount: decimal(wallet?.balance), currency: 'USD' }),
}
```

`optional: true` 的端点失败只会让该项变成 `undefined`，`parse` 仍会被调用；
`check(bodies)` 可以先把藏在 HTTP 200 里的业务错误码映射成 `expired` / `error`。
`parse` / `check` 都是纯函数，直接写单测即可，不用起网络。

## 3. 需要保存状态时用工厂

适配器要缓存东西（抓取时间、折扣时段）时，导出工厂。`buildAdapters(options)`
让每次安装插件都得到独立实例，两个 profile 不会共用缓存：

```js
function createAcmePlan({ cacheDir }) {
  const cache = createCache(cacheDir)          // lib/cache.js
  return { async fetchSecret(key) { /* ... */ } }
}

export default { create: createAcmePlan, id: 'acme-plan', /* 基础字段 */ }
```

宿主里用 `createAdapterSet(options)` 展开工厂：合并后的对象才是适配器，
`create` 不会外泄。

## 4. 配置表单里的校验

厂商有便宜的校验方式就加上——粘错当场报出来比之后显示空行更好：

```js
async validate(value) {
  const body = await getJson('https://api.acme.dev/v1/me', value)
  return body.ok ? { ok: true } : { ok: false, message: body.error }
}
```

返回 `{ ok: false, message }`，不要抛异常；表单只对「非格式错误」提供「仍然保
存」。

## 5. 注册

```js
// lib/registry.js
import acme from './providers/acme.js'
const ALL = [deepseekAccount, deepseek, acme, /* … */ ]
```

再在 `test/providers.test.js` 里给解析函数补一个测试，然后 `npm test`。

## 检查清单

- [ ] 一个文件，其它地方不出现厂商名。
- [ ] 填了 `consoleUrl`——每一行都能链到用户充值/查看的页面。
- [ ] `secret.ref` 与 DSH 已保存的 ref 一致（看 `~/.dsh/.credentials.yaml`），
      免得用户粘两遍。
- [ ] 失败分支返回 `status: 'expired' | 'error'` 和简短 `detail`，不抛异常。
- [ ] 用最小合成响应写了解析测试（不要贴真实账号数据）。
- [ ] 同步更新 `README.md` / `README.zh-CN.md` 里的凭据表。
