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
  setup: { label: 'Acme API key', ref: 'ACME_API_KEY' },
}
```

这就是一个钱包型厂商的全部：宿主解析凭据、`GET url`（`Authorization: Bearer`），
再调 `parseKey`。

### 卡片认得的行字段

| 字段 | 含义 |
| --- | --- |
| `amount`、`currency`、`bonus` | 钱包行（`kind: 'money'` / `'account'`） |
| `usedPct`、`remainPct`、`endAt` | 套餐行；`remainingDays` 由插件推导 |
| `plan` | 套餐名，渲染为「厂商 · 套餐」 |
| `windows` | `[{label, usedPct, resetAt}]`，每条一个进度条（OpenCode Go） |
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
链接，方便用户复制。

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
- [ ] 用裁剪过的真实响应写了解析测试。
- [ ] 更新 `README.zh-CN.md` / `README.md` 里的服务商表。
