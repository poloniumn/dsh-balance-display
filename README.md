<div align="center">

# Balance display · 余额显示

**在 DSH 侧边栏一眼看清所有已启用模型服务商的钱包余额与 Token Plan 用量。**

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-topics-6366f1?style=flat-square)](https://github.com/topics/dsh-plugin)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.0--rc.2-1e3a8a?style=flat-square)]()
[![Node](https://img.shields.io/badge/Node-%E2%89%A5%2020-38bdf8?style=flat-square)]()
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-0b1220?style=flat-square)](CHANGELOG.md)

[简体中文](README.md) · [English](README_EN.md) · [dsh-plugin 话题](https://github.com/topics/dsh-plugin) · [更新日志](CHANGELOG.md)

</div>

![banner](assets/banner.svg)

<div align="center">

属于 **dsh-plugin** 生态 · <https://github.com/topics/dsh-plugin>

</div>

---

## ✨ 功能特性

一个卡片，三块内容，全部来自你**真正启用**的服务商：

| 区块 | 行 | 数据来源 |
| --- | --- | --- |
| **Token Plan** | Qwen · Lite、MIMO · Lite、OpenCode · Go、Z.ai、MiniMax… | 厂商的套餐接口 / 控制台会话 |
| **账户余额** | DeepSeek、MiMo、Kimi、SiliconFlow… | 各厂商自己的余额接口（鉴权、端点数与金额单位各不相同） |
| **第三方渠道** | WorkBuddy、Trae、Qoder · LobsterAI、Qoder 中国版、TRAE、Cline、Loomy、Raccoon、MiniMax Code、ZCode、Gemini | 已安装的 `dsh-connect` 插件，以及 our Free Model 的 **EAC router** 页 |

没启用的服务商不会出现，也不需要任何手动隐藏。

- **今日减少** — 金额前的黄色 `-¥0.42` 是当天 0 点以来这个钱包减少的量。充值不算增加，只会重设基准，所以一次退款不会把一天的用量吃掉。
- **颜色分级** — 人民币余额低于 `10` 变黄，低于 `1`（含负数）变红。
- **套餐行** — 名称是「厂商 · 套餐」，黄色 `↑4%` 是当天用掉的百分比，进度条是本周期用量与剩余天数。
- **夜间折扣** — 厂商折扣时段开启时，套餐名后出现绿色 `夜间 4 折` 标签，并列出折扣覆盖的模型。Qwen 的时段与折扣每天从模型目录抓一次，MiMo 的来自公开的 Token Plan FAQ。
- **高峰时段** — DeepSeek、MiMo 余额后的绿点 / 红点表示当前是否高峰期，悬停可看时段。
- **EAC router 积分** — our Free Model 的 EAC router 页里每个渠道各占一行：`剩余积分 1.2K`、`剩余余额（USD） $3.50`、`剩余 Token`，或 `剩余配额` 加分桶进度条。Gemini 的配额绝不求和成余额（它的 `total` 是跨模型池的百分比相加），没配账号的渠道直接不出现，而不是显示一个 0。
- **折叠状态按浏览器记住** — 三个区块默认全部折叠，点击标题单独展开或收起，三个同时收起也算正常状态。
- **没有设置齿轮** — 配置入口在 **设置 → 插件 → 余额显示**；缺凭据的行仍可点击，卡片无数据时也有「配置密钥」按钮，设置对话框不可达时仍能进入配置。

## 📦 安装

### 方式一：库管理器（推荐）

1. 在 DeepSeek Harness 里打开 **库管理器** 面板。
2. 切到 **「我的项目」** 标签页。
3. 用 **「从账号拉取」** 填入 `https://github.com/poloniumn/dsh-balance-display`，或用 **「本地导入」** 指向你 clone 下来的目录。
4. 把它放进 **`dsh plugin`** 文件夹。
5. **重启 DSH** —— 宿主侧与侧栏卡片都只在启动时加载一次，重启后才生效。

### 方式二：手动 clone

```bash
git clone https://github.com/poloniumn/dsh-balance-display.git
```

把克隆下来的目录放进 DSH 的 `dsh plugin` 目录，或在仓库目录内执行：

```bash
dsh plugin install .
```

<details>
<summary>从 npm 安装（可选）</summary>

```bash
dsh plugin install dsh-balance-display
```

</details>

bundle 只会插入一行加载项（`dsh-balance-display`），宿主侧无需额外配置：服务商列表直接读你 `llm-pi-ai` 配置里的 `providers`。

所有凭据都放在 DSH 凭据库（`~/.dsh/.credentials.yaml`），不会写进插件配置、日志或 `localStorage`。

## 🚀 使用方法

装好并重启后，侧边栏下方出现卡片：

1. 点 **Token Plan** / **账户余额** / **第三方渠道** 的标题，展开对应区块。
2. 缺凭据的行显示「未配置密钥 / --」，点它直接跳到设置页对应卡片，粘贴后点 **保存并测试**。值会**先校验再保存**，粘错了当场报错，而不是之后显示一行空数据。
3. 卡片每分钟刷新一次；上游失败时保留上一份快照，不会闪成空白。

## ⚙️ 配置说明

### 与 dsh-model-panel 共用同一个设置页

两个插件读的是同一批控制台 Cookie，所以配置页只有一份。宿主侧读本机 profile 的 `package.json`（`dependencies` 与 `dsh.profile.bundles`）判断 `dsh-model-panel` 是否真的在加载：

- **装了并且已加载** → 那个插件注册的设置页就是唯一入口，本插件不再注册第二个标签页，避免出现两个一模一样的「Cookie 用量」页。
- **没装 / 装了没启用** → 本插件自己注册同一位置（`设置 → 插件`）的页面，内容与文案和那边一致，照样能用。

判断结果从 `/dsh-balance/peers.json` 拿到（`state.json` 里也带一份 `sharedSetup`），缓存进 `localStorage`，所以只在首次启动问一次。

### 凭据对照表

设置页是一整页标签，不是弹窗：插件认识的每一份凭据各占一张卡片，按类型分组（Token Plan 的 Cookie 在前，钱包类在后）。卡片上给出掩码值、厂商控制台链接、刚读到的余额或套餐用量，以及一个粘贴框——Cookie-Editor 的 JSON 导出、Netscape 的 `cookies.txt`、或整行 `Cookie:` 头都能直接用，也可以把文件直接拖进框里。

| 凭据 | 获取位置 |
| --- | --- |
| `DEEPSEEK_API_KEY` | <https://platform.deepseek.com/api_keys> |
| `QWEN_TOKEN_PLAN_COOKIE` | 见下方「阿里 Cookie」，这项是 Cookie 不是密钥 |
| `XIAOMI_API_KEY` | <https://platform.xiaomimimo.com/console/api-keys> |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | <https://platform.xiaomimimo.com/console/plan-manage> |
| `OPENCODE_GO_API_KEY` | <https://opencode.ai/console/workspace>（找不到时自动回退 `OPENCODE_API_KEY`） |
| `ZAI_CODING_CN_API_KEY` / `ZAI_CODING_API_KEY` | Z.ai 中国站 / 国际站（**两个站鉴权方式不同**） |
| `OPENROUTER_API_KEY` | <https://openrouter.ai/settings/keys> |
| `SILICONFLOW_API_KEY`、`NOVITA_API_KEY`、`HYPERBOLIC_API_KEY`、`DEEPINFRA_API_KEY`、`AI_GATEWAY_API_KEY` | 各平台 API Keys |
| `NANOGPT_API_KEY`、`SYNTHETIC_API_KEY`、`CHUTES_API_KEY`、`OLLAMA_API_KEY`、`APIGOTO_API_KEY` | 各平台 API Keys |
| `MINIMAX_CN_API_KEY` / `MINIMAX_API_KEY` | MiniMax 中国站 / 国际站 |
| `ZENMUX_MANAGEMENT_API_KEY` | ZenMux **Management** Key（推理 Key 查不到额度） |

Kimi / Moonshot（`KIMI_API_KEY`、`MOONSHOT_API_KEY`）直接复用 DSH 模型路由里已有的密钥，因此设置页没有对应表单，需要在模型服务商配置里填写。

### 阿里（Qwen Token Plan）Cookie

Qwen 没有查询套餐用量的接口，数字只在 `platform.qianwenai.com` 控制台会话后面，所以插件保存的是控制台的 `Cookie` 请求头。

1. 登录 <https://platform.qianwenai.com/home/billing/subscription/token-plan>。
2. 打开开发者工具 → **网络** → 任选一个发往 `platform.qianwenai.com` 的请求。
3. 复制整行 `Cookie` 请求头。
4. DSH → 设置 → 插件 → 余额显示 → 「Qwen Token Plan console cookie」→ 粘贴 → 保存并测试。

Cookie 大约 7 天过期，看到「登录已过期」时重新复制一次即可。想用终端也可以：

```bash
npx dsh-balance-qwen-cookie --paste      # 隐藏输入，先校验再写入
npx dsh-balance-qwen-cookie --from-copy  # 直接从剪贴板读取
npx dsh-balance-qwen-cookie --check      # 查看已存的凭据是否还有效
npx dsh-balance-qwen-cookie --remove
```

### 哪些服务商会出现

只看你 DSH 配置里真正启用的：插件读取 `llm-pi-ai` 配置项的 `providers`（含 inherited / override 层），保留没有 `disabled` 的条目。DSH 登录本身提供 `deepseek-account`；装了 `dsh-connect` 时才会有第三方渠道行，装了 our Free Model 时才会有它 EAC router 各渠道的积分行。

服务商 id 到适配器的映射在 [`lib/registry.js`](lib/registry.js)；没有适配器的服务商仍然会以一个控制台链接出现。要加一家厂商，看 [docs/adding-a-provider.zh-CN.md](docs/adding-a-provider.zh-CN.md)，基本是写一个小文件。

### 取数方式

厂商接口契约取自 [dsh-subusage 0.24.5](https://github.com/KouzakiUmi/dsh-subusage)（KouzakiUmi，MIT，归属声明见 [NOTICE](NOTICE)）。

一条 `GET + Authorization: Bearer` 走不通所有厂商。宿主侧的 [`lib/upstream.js`](lib/upstream.js) 统一负责请求，适配器只声明端点、鉴权模式和纯解析函数（[`lib/providers/vendors.js`](lib/providers/vendors.js)）：

| 形态 | 例子 | 处理 |
| --- | --- | --- |
| 裸 `Authorization` | Z.ai 国际站、Ollama Cloud | `auth: 'raw'`，不加 `Bearer` |
| `x-api-key` + POST | NanoGPT 余额 | 独立端点 `POST {}`，与管理版 Key 的另一套 host 配套 |
| Cookie 会话 | Qwen、MiMo 控制台 | `auth: 'cookie'` 加 Origin / Referer |
| 双端点、部分失败降级 | OpenRouter、ZenMux、Kimi、NanoGPT | 主端点必需，次端点 `optional: true`；次端点 403 只丢次要信息，整行不失败 |
| 200 里藏业务错误码 | MiniMax `base_resp.status_code` | `check()` 映射成 `expired` / `error` |
| 金额单位各异 | Novita 1/10000 USD、Hyperbolic 美分、DeepInfra 负余额、Vercel 十进制串 | 各家 `parse()` 显式换算，不做通用折算 |
| 同一把 Key 两种引用名 | OpenCode Go | `secret.aliases` 逐个尝试，不跨来源拼接 |

统一护栏（走 `lib/upstream.js` 的请求）：10 秒超时、`redirect: 'manual'`、1 MiB 响应上限；3xx 不误判成凭据过期，401/403 → `expired`，408/429/5xx 标记可重试，非 JSON 响应视为会话失效。少数手写适配器仍用通用 `getJson`，超时为 8 秒。

`kimi-coding` 先试订阅额度接口（4 秒超时），失败自动回落到 Moonshot 钱包，因此订阅 Key 和开放平台 Key 都能出数。

EAC router 的渠道是另一种形态：our Free Model 根本没给渠道积分开 HTTP 路由，所以 [`lib/ofm-credits.js`](lib/ofm-credits.js) 走它自己也在用的 `usage.badge`——通过宿主的进程内 Connection（`createPeer` + `createSharedFetchHandler('/api')`），因为裸的回环 `fetch` 打 `/api/*` 不带会话，会被网关直接拒绝。选 `usage.badge` 而不是 `credits.balances`，是因为前者有宿主缓存、只含启用账号，卡片的分钟级轮询不会把上游请求数放大。

仍**未**移植的是依赖本机 OAuth 登录文件、扫码或 IAM 签名的几家（Grok、Codex、GitHub Copilot、火山方舟、Command Code）——它们要用到宿主的登录与凭据记录服务，不是一次 HTTP 请求能解决的。

### 隐私与网络请求

- 凭据只会发往该厂商适配器声明的地址，带超时，永远不会发往浏览器传来的 URL。
- 状态接口仅限 DSH 窗口访问：loopback host、loopback（或缺失）origin、非跨站 `Sec-Fetch-Site`，并叠加宿主自己的 `connection.requestRejection`。
- 写入接口（`POST /dsh-balance/secret`）只接收一个值，校验后写入 DSH 凭据库；从不返回明文，配置页只能看到 `oc_…9F (41)` 这样的掩码。
- 除你配置的厂商接口外，插件只会访问：两个公开文档页（DeepSeek 定价、MiMo 套餐 FAQ，每天一次）、Qwen 模型目录（每天一次，在折扣时段开始时）、本机的 `dsh-connect`，以及 our Free Model 自己的 `/api/channel-pack`（走宿主进程内 Connection，不经过网络，且只读它已经在缓存的 `usage.badge`）。

### 数据文件

缓存位于 `<DSH_HOME>/dsh-balance-display/`（默认 `~/.dsh/…`）：

| 文件 | 内容 |
| --- | --- |
| `baseline.json` | 每行的当日基准，用于计算「今日减少」 |
| `schedules.json` | 从公开页面抓取的高峰 / 夜间时段 |
| `qwen-discount.json` | Qwen 折扣标签及其读取时间 |
| `last-state.json` | 上一次真正拿到数据的快照：凭据库还没就绪时用它顶上，不会写坏缓存 |

删掉这个目录即恢复初始状态。

## 🖼 成果展示

<!-- 截图区：把 png/jpg 放进本仓库的 images/ 目录，然后按下面的网格排布 -->

> **截图收集中。** 当前仓库还没有附带截图。把截图放进本仓库的 `images/` 目录（或者放进发布工作区后让我来布局），再用下面这段网格替换本段说明即可——两列自适应，深色背景下的卡片截图看起来最干净。

<!--
<table>
  <tr>
    <td align="center" width="50%">
      <img src="images/sidebar-card.png" alt="侧边栏余额卡片" width="420"><br>
      <sub><b>侧边栏卡片</b> · Token Plan、余额、第三方渠道三区块</sub>
    </td>
    <td align="center" width="50%">
      <img src="images/settings-page.png" alt="设置页" width="420"><br>
      <sub><b>设置 → 插件 → 余额显示</b> · 每份凭据一张卡片，粘贴即校验</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="images/plan-rows.png" alt="套餐行" width="420"><br>
      <sub><b>套餐行</b> · 夜间折扣标签与当日用量百分比</sub>
    </td>
    <td align="center" width="50%">
      <img src="images/badges.png" alt="今日减少与颜色分级" width="420"><br>
      <sub><b>今日减少</b> · 黄色 <code>-¥0.42</code> 与低余额变色</sub>
    </td>
  </tr>
</table>
-->

## 🧪 开发

```bash
npm test    # node --test，无依赖
```

目录结构：

```
index.js            宿主侧入口（Cordis 插件，提供 /dsh-balance/*）
client.js           浏览器侧卡片（注册到 sidebar.footer.action）
lib/                取数、路由、快照、凭据、调度
lib/providers/      每家厂商一个适配器
tools/              qwen-cookie 命令行与测试运行器
docs/               新增服务商指南（中 / 英）
cordis.patch.yml    bundle 加载行
assets/banner.svg   README 横幅
images/             README 截图
```

## 致谢

厂商接口契约参考自 [dsh-subusage 0.24.5](https://github.com/KouzakiUmi/dsh-subusage)（KouzakiUmi，MIT），所需归属声明保留在 [NOTICE](NOTICE)。

## 📄 许可证

[MIT](LICENSE) © 2026 poloniumn

<div align="center">

[⬆ 回到顶部](#balance-display--余额显示) · [dsh-plugin 话题](https://github.com/topics/dsh-plugin)

</div>
