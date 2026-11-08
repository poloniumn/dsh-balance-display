# Balance display · 余额显示

DSH 侧边栏下方的余额小卡片：显示你在 DSH 里**已启用**的模型服务商钱包余额、
Token Plan 用量，以及第三方编程渠道的额度。没启用的服务商不会出现，也不需要
任何手动隐藏。

> English: [README.md](README.md)。

## 卡片内容

| 区块 | 行 | 数据来源 |
| --- | --- | --- |
| **Token Plan** | Qwen · Lite、MIMO · Lite、OpenCode · Go、Z.ai、MiniMax… | 厂商的套餐接口 / 控制台会话 |
| **账户余额** | DeepSeek、MiMo、Kimi、SiliconFlow… | 各厂商自己的余额接口（鉴权、端点数与金额单位各不相同） |
| **第三方渠道** | WorkBuddy、Trae、Qoder | 已安装的 `dsh-connect` 插件 |

三个区块默认全部折叠，点击标题单独展开或收起；折叠状态按浏览器记住，三个同时收起也是正常状态。卡片标题栏没有设置齿轮，配置入口在 **设置 → 插件 → 余额显示**；缺凭据的行仍可点击，卡片无数据时也有「配置密钥」按钮，保证设置对话框不可达时仍能进入配置。

细节：

* **今日减少** — 金额前的黄色 `-¥0.42` 是当天 0 点以来这个钱包减少的量。充值
  不算增加，只会重设基准，所以一次退款不会把一天的用量吃掉。
* **颜色** — 人民币余额低于 `10` 变黄，低于 `1`（含负数）变红。
* **套餐行** — 名称是「厂商 · 套餐」，黄色 `↑4%` 是当天用掉的百分比，进度条是本
  周期用量与剩余天数。
* **夜间折扣** — 厂商折扣时段开启时，套餐名后出现绿色 `夜间 4 折` 标签，并列出折
  扣覆盖的模型。Qwen 的时段与折扣每天从模型目录抓一次，MiMo 的来自公开的 Token
  Plan FAQ。
* **高峰时段** — DeepSeek、MiMo 余额后的绿点/红点表示当前是否高峰期，悬停可看时
  段。

## 安装

```bash
# 在本目录执行
dsh plugin install .
```

或在 DSH 里让插件管理器指向这个目录。bundle 只会插入一行加载项
（`dsh-balance-display`），宿主侧无需配置：服务商列表直接读你 `llm-pi-ai`
配置里的 providers。

所有凭据都放在 DSH 凭据库（`~/.dsh/.credentials.yaml`），不会写进插件配置、日志
或 `localStorage`。

## 配置凭据

没有凭据的行会显示「未配置密钥 / --」。点这一行，DSH 会打开
**设置 → 插件 → 余额显示**，粘贴后点「保存并测试」。值会**先校验再保存**，粘错
了当场报错，而不是之后显示一行空数据。

| 凭据 | 获取位置 |
| --- | --- |
| `DEEPSEEK_API_KEY` | <https://platform.deepseek.com/api_keys> |
| `QWEN_TOKEN_PLAN_COOKIE` | 见下文，这项是 Cookie 不是密钥 |
| `XIAOMI_API_KEY` | <https://platform.xiaomimimo.com/console/api-keys> |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | <https://platform.xiaomimimo.com/console/plan-manage> |
| `OPENCODE_GO_API_KEY` | <https://opencode.ai/console/workspace>（找不到时自动回退 `OPENCODE_API_KEY`） |
| `ZAI_CODING_CN_API_KEY` / `ZAI_CODING_API_KEY` | Z.ai 中国站 / 国际站（**两个站鉴权方式不同**） |
| `OPENROUTER_API_KEY` | <https://openrouter.ai/settings/keys> |
| `SILICONFLOW_API_KEY`、`NOVITA_API_KEY`、`HYPERBOLIC_API_KEY`、`DEEPINFRA_API_KEY`、`AI_GATEWAY_API_KEY` | 各平台 API Keys |
| `NANOGPT_API_KEY`、`SYNTHETIC_API_KEY`、`CHUTES_API_KEY`、`OLLAMA_API_KEY`、`APIGOTO_API_KEY` | 各平台 API Keys |
| `MINIMAX_CN_API_KEY` / `MINIMAX_API_KEY` | MiniMax 中国站 / 国际站 |
| `ZENMUX_MANAGEMENT_API_KEY` | ZenMux **Management** Key（推理 Key 查不到额度） |

Kimi / Moonshot（`KIMI_API_KEY`、`MOONSHOT_API_KEY`）直接复用 DSH 模型路由里
已有的密钥，因此设置页没有对应表单，需要在模型服务商配置里填写。

设置页默认只列出 **DSH 后台已启用的服务商**，以及已经保存过密钥的服务商（停用后
仍可清除）；要提前给别家填密钥，点「显示全部服务商」。表单一次只展开一个，面板
在自身范围内滚动，顶部「关闭」始终可见。没启用的服务商不会在卡片上冒出来。

### 阿里（Qwen Token Plan）Cookie

Qwen 没有查询套餐用量的接口，数字只在 `platform.qianwenai.com` 控制台会话后面。
所以插件保存的是控制台的 `Cookie` 请求头。

1. 登录 <https://platform.qianwenai.com/home/billing/subscription/token-plan>。
2. 打开开发者工具 → **网络** → 任选一个发往 `platform.qianwenai.com` 的请求。
3. 复制整行 `Cookie` 请求头。
4. DSH → 设置 → 插件 → 余额显示 → 「Qwen Token Plan console cookie」→ 粘贴 → 保存并测试。

Cookie 大约 7 天过期，看到「登录已过期」时重新复制一次即可。

想用终端也可以：

```bash
npx dsh-balance-qwen-cookie --paste      # 隐藏输入，先校验再写入
npx dsh-balance-qwen-cookie --from-copy  # 直接从剪贴板读取
npx dsh-balance-qwen-cookie --check      # 查看已存的凭据是否还有效
npx dsh-balance-qwen-cookie --remove
```

## 哪些服务商会出现

只看你 DSH 配置里真正启用的：插件读取 `llm-pi-ai` 配置项的 `providers`（含
inherited / override 层），保留没有 `disabled` 的条目。DSH 登录本身提供
`deepseek-account`；装了 `dsh-connect` 时才会有第三方渠道行。

服务商 id 到适配器的映射在 [lib/registry.js](lib/registry.js)；没有适配器的服务
商仍然会以一个控制台链接出现。要加一家厂商，看
[docs/adding-a-provider.zh-CN.md](docs/adding-a-provider.zh-CN.md)，基本是写一个小
文件。

## 取数方式（融合自 dsh-subusage 0.24.5）

厂商接口契约取自 [dsh-subusage 0.24.5](https://github.com/KouzakiUmi/dsh-subusage)
（KouzakiUmi，MIT，归属声明见 [NOTICE](NOTICE)）。

一条 `GET + Authorization: Bearer` 走不通所有厂商。现在宿主侧的
[lib/upstream.js](lib/upstream.js) 统一负责请求，适配器只声明端点、鉴权模式和
纯解析函数 [lib/providers/vendors.js](lib/providers/vendors.js)：

| 形态 | 例子 | 处理 |
| --- | --- | --- |
| 裸 `Authorization` | Z.ai 国际站、Ollama Cloud | `auth: 'raw'`，不加 `Bearer` |
| `x-api-key` + POST | NanoGPT 余额 | 独立端点 `POST {}`，与管理版 Key 的另一套 host 配套 |
| Cookie 会话 | Qwen、MiMo 控制台 | `auth: 'cookie'` 加 Origin / Referer |
| 双端点、部分失败降级 | OpenRouter、ZenMux、Kimi、NanoGPT | 主端点必需，次端点 `optional: true`；次端点 403 只丢次要信息，整行不失败 |
| 200 里藏业务错误码 | MiniMax `base_resp.status_code` | `check()` 映射成 `expired` / `error` |
| 金额单位各异 | Novita 1/10000 USD、Hyperbolic 美分、DeepInfra 负余额、Vercel 十进制串 | 各家 `parse()` 显式换算，不做通用折算 |
| 同一把 Key 两种引用名 | OpenCode Go | `secret.aliases` 逐个尝试，不跨来源拼接 |

统一护栏（走 `lib/upstream.js` 的请求）：10 秒超时、`redirect: 'manual'`、
1 MiB 响应上限；3xx 不误判成凭据过期，401/403 → `expired`，408/429/5xx 标记
可重试，非 JSON 响应视为会话失效。少数手写适配器仍用通用 `getJson`，超时为 8 秒。

`kimi-coding` 先试订阅额度接口（4 秒超时），失败自动回落到 Moonshot 钱包，因此
订阅 Key 和开放平台 Key 都能出数。此前只显示控制台链接的 Z.ai / OpenRouter 现在
能直接读到配额与余额。

仍**未**移植的是依赖本机 OAuth 登录文件、扫码或 IAM 签名的几家（Grok、Codex、
GitHub Copilot、火山方舟、Command Code）——它们要用到宿主的登录与凭据记录服务，
不是一次 HTTP 请求能解决的。

## 隐私与网络请求

* 凭据只会发往该厂商适配器声明的地址，带超时，永远不会发往浏览器传来的 URL。
* 状态接口仅限 DSH 窗口访问：loopback host、loopback（或缺失）origin、非跨站
  `Sec-Fetch-Site`，并叠加宿主自己的 `connection.requestRejection`。
* 写入接口（`POST /dsh-balance/secret`）只接收一个值，校验后写入 DSH 凭据库；从
  不返回明文，配置页只能看到 `oc_…9F (41)` 这样的掩码。
* 除你配置的厂商接口外，插件只会访问：两个公开文档页（DeepSeek 定价、MiMo 套餐
  FAQ，每天一次）、Qwen 模型目录（每天一次，在折扣时段开始时）、以及本机的
  `dsh-connect`。

## 数据文件

缓存位于 `<DSH_HOME>/dsh-balance-display/`（默认 `~/.dsh/…`）：

| 文件 | 内容 |
| --- | --- |
| `baseline.json` | 每行的当日基准，用于计算「今日减少」 |
| `schedules.json` | 从公开页面抓取的高峰 / 夜间时段 |
| `qwen-discount.json` | Qwen 折扣标签及其读取时间 |

删掉这个目录即恢复初始状态。

## 开发

```bash
npm test    # node --test，无依赖
```

目录结构见 [README.md](README.md#development)。

## 致谢

厂商接口契约参考自 [dsh-subusage 0.24.5](https://github.com/KouzakiUmi/dsh-subusage)
（KouzakiUmi，MIT），所需归属声明保留在 [NOTICE](NOTICE)。

## 许可

MIT，见 [LICENSE](LICENSE)。