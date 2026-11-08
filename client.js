/**
 * dsh-balance-display — client half.
 *
 * Registers a card in `sidebar.footer.action` (under the sidebar, beside the
 * shipped buttons). The card has three collapsible sections — Token Plan,
 * account balances and third-party channels — and a setup view for the
 * credentials a provider needs (API keys and console cookies).
 *
 * Every visible string comes from the catalogs below (registered through the
 * DSH locale service); every per-vendor special case comes from the host row
 * itself (`windows`, `nightWindow`, `nightBadges`, `peakSchedule`), so adding
 * a provider needs no change here.
 */
window.__ModuleLoader__.load({
  id: 'dsh-balance-display',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NAMESPACE = 'dsh-balance-display'
    const ENDPOINT = '/dsh-balance/state.json'
    const SETUP_ENDPOINT = '/dsh-balance/setup.json'
    const SECRET_ENDPOINT = '/dsh-balance/secret'
    const POLL_MS = 60000
    // A host-provided window bridge is the only way to reach the settings
    // dialog; DSH does not expose one yet, so this is probed, not assumed.
    const GLOBAL_UI = typeof window !== 'undefined' ? window.__DSH_UI__ : undefined
    const TICK_MS = 60000
    // Balance colours (CNY): below 1 red (negatives included), below 10 yellow.
    const WARN_THRESHOLD = 10
    const LOW_THRESHOLD = 1
    const SETUP_PENDING_KEY = 'dsh-balance-display:pending-setup'
    const STORAGE_KEY = 'dsh-balance-display:collapsed'

    // ---------- locale ----------
    const zh = {
      'card.planTitle': 'Token Plan',
      'card.balanceTitle': '账户余额',
      'card.thirdTitle': '第三方渠道',
      'card.thirdEmpty': '未检测到第三方渠道',
      'card.empty': '没有已启用的模型服务商',
      'card.loading': '余额加载中…',
      'card.refreshErr': '刷新失败：',
      'card.updated': '更新于',
      'card.expandTitle': '展开',
      'card.collapseTitle': '收起',
      'card.setup': '配置密钥',
      'row.noKey': '未配置密钥',
      'row.expired': '登录已过期',
      'row.failed': '获取失败',
      'row.days': '剩 {n} 天',
      'row.today': '今日减少',
      'row.todayPlan': '今日已用',
      'row.peakTip': '高峰时段（{windows}），空闲时段半价',
      'row.offPeakTip': '当前为空闲时段',
      'row.setupTip': '点击这里填入 {label}',
      'row.reload': '刷新',
      'row.night': '夜间 {discount} 折',
      'setup.title': '余额显示 · 配置',
      'setup.subtitle': '密钥与 Cookie 只保存在本机 DSH 凭据库，不写入插件配置、日志或浏览器存储。',
      'setup.back': '返回',
      'setup.open': '打开控制台',
      'setup.save': '保存并测试',
      'setup.clear': '清除',
      'setup.stored': '已配置',
      'setup.missing': '未配置',
      'setup.testing': '正在校验…',
      'setup.saved': '已保存',
      'setup.cleared': '已清除',
      'setup.forceSave': '仍然保存',
      'setup.fold': '收起',
      'setup.handoff': '已打开「设置 → 插件 → 余额显示」，请在那里的表单中粘贴。',
      'setup.howToCookie': '打开控制台并登录 → 开发者工具 → 网络 → 任意请求 → 复制请求头中整行的 Cookie 值。Cookie 约 7 天过期，过期后重新复制即可。',
      'setup.howToKey': '在控制台创建 API Key 后粘贴到这里。',
      'setup.cookiePlaceholder': 'name=value; name2=value2',
      'setup.keyPlaceholder': '粘贴 API Key',
      'setup.neverShown': '出于安全考虑，已保存的值不会回显。',
    }
    const en = {
      'card.planTitle': 'Token plan',
      'card.balanceTitle': 'Balances',
      'card.thirdTitle': 'Third-party',
      'card.thirdEmpty': 'No third-party channel detected',
      'card.empty': 'No model provider is enabled',
      'card.loading': 'Loading balances…',
      'card.refreshErr': 'Refresh failed: ',
      'card.updated': 'Updated',
      'card.expandTitle': 'Expand',
      'card.collapseTitle': 'Collapse',
      'card.setup': 'Configure key',
      'row.noKey': 'No key',
      'row.expired': 'Signed out',
      'row.failed': 'Failed',
      'row.days': '{n}d left',
      'row.today': 'used today',
      'row.todayPlan': 'used today',
      'row.peakTip': 'Peak hours ({windows}) — off-peak is half price',
      'row.offPeakTip': 'Off-peak right now',
      'row.setupTip': 'Click to add {label}',
      'row.reload': 'Reload',
      'row.night': 'Night {discount}× off',
      'setup.title': 'Balance display · Setup',
      'setup.subtitle': 'Keys and cookies live in the local DSH credential store — never in the plugin config, the logs or browser storage.',
      'setup.back': 'Back',
      'setup.open': 'Open console',
      'setup.save': 'Save and test',
      'setup.clear': 'Clear',
      'setup.stored': 'Configured',
      'setup.missing': 'Not configured',
      'setup.testing': 'Checking…',
      'setup.saved': 'Saved',
      'setup.cleared': 'Cleared',
      'setup.forceSave': 'Save anyway',
      'setup.fold': 'Close',
      'setup.handoff': 'Opened Settings → Plugins → Balance display — paste it into the form there.',
      'setup.howToCookie': 'Sign in to the console → DevTools → Network → any request → copy the whole `Cookie` request header. It expires after about a week; copy it again when the row says signed out.',
      'setup.howToKey': 'Create an API key in the console and paste it here.',
      'setup.cookiePlaceholder': 'name=value; name2=value2',
      'setup.keyPlaceholder': 'Paste the API key',
      'setup.neverShown': 'Stored values are never echoed back.',
    }

    const FALLBACK = en

    /** Translate from the catalog, never falling back to a raw key. */
    function translate(active, key, vars) {
      const catalog = String(active || '').toLowerCase().startsWith('zh') ? zh : en
      let text = catalog[key] ?? FALLBACK[key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value))
      }
      return text
    }

    function readLocale(ctx) {
      let locale = null
      try { locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : null } catch { locale = null }
      if (locale) {
        for (const method of ['getLocale', 'getSnapshot']) {
          try {
            if (typeof locale[method] !== 'function') continue
            const value = locale[method]()
            if (value && typeof value.active === 'string' && value.active) return value.active
          } catch { /* try the next accessor */ }
        }
      }
      try {
        return String(document.documentElement.getAttribute('lang') || navigator.language || 'en')
      } catch {
        return 'en'
      }
    }

    function useActiveLocale(ctx) {
      const [active, setActive] = React.useState(() => readLocale(ctx))
      React.useEffect(() => {
        const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : null
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        const sync = () => setActive(readLocale(ctx))
        const off = locale.subscribe(sync)
        sync()
        return () => {
          try {
            if (typeof off === 'function') off()
            else if (off && typeof off.dispose === 'function') off.dispose()
          } catch { /* ignore */ }
        }
      }, [ctx])
      return active
    }

    function useTranslator(ctx) {
      const active = useActiveLocale(ctx)
      return React.useCallback((key, vars) => translate(active, key, vars), [active])
    }

    // ---------- formatting ----------
    function money(value, currency) {
      const n = Number(value)
      if (!Number.isFinite(n)) return '--'
      const symbol = String(currency || 'CNY').toUpperCase() === 'USD' ? '$' : '¥'
      return `${symbol}${n.toFixed(2)}`
    }

    function clock(ms) {
      const d = new Date(Number(ms) || Date.now())
      const p = (v) => String(v).padStart(2, '0')
      return `${p(d.getHours())}:${p(d.getMinutes())}`
    }

    /** Beijing-time minutes since midnight — the schedules are Beijing-local. */
    function beijingMinutes(now) {
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
      const d = new Date(utcMs + 8 * 3600000)
      return d.getHours() * 60 + d.getMinutes()
    }

    function beijingWeekday(now) {
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
      return new Date(utcMs + 8 * 3600000).getDay()
    }

    /** True inside [start, end) — wraps past midnight when end <= start. */
    function inWindow(minutes, start, end) {
      if (start === end) return false
      return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
    }

    function inNightWindow(now, window) {
      if (!window) return false
      const start = Number(window.startHour || 0) * 60 + Number(window.startMinute || 0)
      const end = Number(window.endHour || 0) * 60 + Number(window.endMinute || 0)
      return inWindow(beijingMinutes(now), start, end)
    }

    function hhmm(minutes) {
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    }

    function peakWindowsText(schedule) {
      const windows = (schedule && schedule.windows) || []
      return windows.map((win) => `${hhmm(win.startMinute)}-${hhmm(win.endMinute)}`).join(' / ')
    }

    /** A row carrying `peakSchedule` is in peak state inside those windows. */
    function isPeak(now, row) {
      const schedule = row && row.peakSchedule
      if (!schedule) return null
      if (Array.isArray(schedule.weekdays) && schedule.weekdays.length
        && !schedule.weekdays.includes(beijingWeekday(now))) return false
      const minutes = beijingMinutes(now)
      return (schedule.windows || []).some((win) => inWindow(minutes, win.startMinute, win.endMinute))
    }

    // ---------- styles (DSH design tokens) ----------
    const S = {
      wrap: {
        position: 'fixed',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 120px)',
        pointerEvents: 'auto',
      },
      box: {
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
        borderRadius: '16px',
        padding: '10px 12px 9px',
        fontSize: '12px',
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-primary, rgba(255,255,255,0.85))',
        boxSizing: 'border-box',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        minHeight: '18px',
      },
      headerButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        minWidth: 0,
        flex: '1 1 auto',
      },
      chevron: {
        width: '10px',
        display: 'inline-block',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.5))',
        transition: 'transform 0.15s ease',
        flex: '0 0 auto',
      },
      title: {
        fontWeight: 500,
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.65))',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      },
      stamp: {
        fontSize: '10px',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.5))',
        whiteSpace: 'nowrap',
      },
      gear: {
        background: 'transparent',
        border: 'none',
        padding: '0 2px',
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.55))',
        fontSize: '12px',
        lineHeight: 1,
        flex: '0 0 auto',
      },
      body: { marginTop: '6px' },
      row: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '3px 0',
      },
      left: { display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 },
      name: {
        color: 'var(--dsw-alias-brand-primary, #ffb366)',
        cursor: 'pointer',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      dot: { width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', flex: '0 0 auto' },
      amount: {
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-primary, rgba(255,255,255,0.85))',
      },
      amountLow: { color: 'var(--dsw-alias-state-error-primary, #ff7875)' },
      amountWarn: { color: '#f5c451' },
      delta: {
        color: '#f5c451',
        fontVariantNumeric: 'tabular-nums',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        display: 'inline-block',
        minWidth: '48px',
        textAlign: 'center',
      },
      deltaPct: {
        color: '#f5c451',
        fontVariantNumeric: 'tabular-nums',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      },
      muted: { color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.45))' },
      err: {
        color: 'var(--dsw-alias-state-error-primary, #ff7875)',
        fontSize: '11px',
        marginTop: '4px',
        wordBreak: 'break-word',
      },
      ok: { color: 'var(--dsw-alias-state-success-primary, #49aa19)', fontSize: '11px', marginTop: '4px' },
      sep: { borderTop: '1px dashed var(--dsw-alias-border-l1, rgba(255,255,255,0.08))', margin: '2px 0' },
      barRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0 3px' },
      bar: {
        flex: '1 1 auto',
        height: '6px',
        borderRadius: '3px',
        background: 'var(--dsw-alias-border-l1, rgba(255,255,255,0.08))',
        overflow: 'hidden',
        minWidth: 0,
      },
      barFill: {
        height: '100%',
        borderRadius: '3px',
        background: 'var(--dsw-alias-state-success-primary, #49aa19)',
        transition: 'width 0.4s ease',
      },
      barFillLow: { background: 'var(--dsw-alias-state-error-primary, #ff7875)' },
      barPct: {
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        fontSize: '11px',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.65))',
        whiteSpace: 'nowrap',
      },
      nightRow: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', minWidth: 0, flexWrap: 'wrap' },
      nightBadge: {
        background: 'rgba(73,170,25,0.15)',
        color: 'var(--dsw-alias-state-success-primary, #49aa19)',
        borderRadius: '6px',
        padding: '1px 6px',
        fontSize: '11px',
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      },
      nightModels: {
        color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))',
        fontSize: '11px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
      },
      windowLabel: {
        fontSize: '11px',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.65))',
        whiteSpace: 'nowrap',
        minWidth: '46px',
      },
      marker: { display: 'block', width: 0, height: 0, overflow: 'hidden' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        marginTop: '4px',
        padding: '4px 6px',
        fontSize: '11px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.14))',
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.15))',
        color: 'inherit',
        fontFamily: 'inherit',
      },
      button: {
        padding: '3px 8px',
        fontSize: '11px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.14))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      buttonPrimary: {
        padding: '3px 8px',
        fontSize: '11px',
        borderRadius: '6px',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-brand-primary, #ffb366)',
        color: '#1a1a1a',
        cursor: 'pointer',
        fontWeight: 500,
      },
      buttonRow: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '5px', flexWrap: 'wrap' },
      mutedSmall: {
        fontSize: '10px',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.5))',
        marginTop: '3px',
        lineHeight: 1.45,
      },
    }

    function fillStyle(pct) {
      const width = pct === null ? '0%' : `${Math.max(0, Math.min(100, pct))}%`
      return { ...S.barFill, width, ...(pct !== null && pct < 20 ? S.barFillLow : null) }
    }

    function pctText(value) {
      return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(100, value)) * 10) / 10}%` : '--'
    }

    function Bar(props) {
      const { label, pct, title } = props
      return h('div', { style: S.barRow },
        label ? h('span', { style: S.windowLabel, title }, label) : null,
        h('div', { style: S.bar }, h('div', { style: fillStyle(pct) })),
        h('span', { style: S.barPct }, pctText(pct)))
    }

    // ---------- one plan row ----------
    function PlanSection(props) {
      const { row, t, now } = props
      const nameText = row.plan ? `${row.label} · ${row.plan}` : row.label
      const usedToday = Number.isFinite(row.todayUsedPct) && row.todayUsedPct > 0
        ? h('span', { style: S.deltaPct, title: `${t('row.todayPlan')} ${row.todayUsedPct}%` }, `↑${row.todayUsedPct}%`)
        : null

      const children = [
        h('div', { style: S.row },
          h('span', { style: S.left },
            h('a', {
              href: row.consoleUrl || undefined,
              target: '_blank',
              rel: 'noreferrer noopener',
              style: S.name,
              title: row.consoleUrl || nameText,
            }, nameText),
            usedToday),
          h('span', { style: S.amount }, Number.isFinite(row.remainingDays)
            ? t('row.days', { n: row.remainingDays })
            : '--')),
      ]

      // A plan may expose several rolling windows (e.g. monthly / weekly /
      // 5-hour); each gets its own labelled bar.
      if (Array.isArray(row.windows) && row.windows.length) {
        for (const win of row.windows) {
          children.push(h(Bar, {
            key: `win-${win.label}`,
            label: win.label,
            pct: Number.isFinite(win.remainPct) ? win.remainPct : null,
            title: win.resetAt ? new Date(win.resetAt).toLocaleString() : undefined,
          }))
        }
      } else if (row.status === 'ok') {
        children.push(h(Bar, { key: 'win', pct: Number.isFinite(row.remainPct) ? row.remainPct : null }))
      }

      // Night-discount pills, shown only inside the window the host reports.
      if (inNightWindow(now, row.nightWindow) && Array.isArray(row.nightBadges) && row.nightBadges.length) {
        children.push(h('div', { style: S.nightRow }, row.nightBadges.map((badge, index) => {
          const models = Array.isArray(badge.models) ? badge.models.join(' · ') : ''
          return h('span', { key: `night-${index}`, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 } },
            h('span', { style: S.nightBadge }, t('row.night', { discount: badge.discount || '?' })),
            models ? h('span', { style: S.nightModels, title: models }, models) : null)
        })))
      }

      return h('div', null, children)
    }

    // ---------- third-party channel ----------
    function ThirdPartyRow(props) {
      const { item } = props
      const pct = Number.isFinite(item.remainPct) ? Math.max(0, Math.min(100, item.remainPct)) : null
      return h('div', null,
        h('div', { style: S.row },
          h('span', { style: S.left }, h('span', { style: S.name, title: item.kind || undefined }, item.name)),
          h('span', { style: S.amount }, item.label || (pct !== null ? `${Math.round(pct)}%` : ''))),
        pct === null ? null : h(Bar, { pct }))
    }

    // ---------- balance row ----------
    function BalanceRow(props) {
      const { row, t, now, onSetup } = props
      const peak = isPeak(now, row)
      const isCny = String(row.currency || 'CNY').toUpperCase() !== 'USD'
      const low = isCny && Number.isFinite(row.amount) && row.amount < LOW_THRESHOLD
      const warn = isCny && Number.isFinite(row.amount) && row.amount < WARN_THRESHOLD && !low
      let valueEl
      if (row.status === 'ok' && Number.isFinite(row.amount)) {
        valueEl = h('span', {
          style: low ? { ...S.amount, ...S.amountLow } : warn ? { ...S.amount, ...S.amountWarn } : S.amount,
          title: row.bonus ? `+${money(row.bonus, row.currency)}` : undefined,
        }, money(row.amount, row.currency))
      } else if (row.status === 'ok' && Number.isFinite(row.remainPct)) {
        const pct = Math.max(0, Math.min(100, row.remainPct))
        valueEl = h('span', {
          style: pct < 20 ? { ...S.amount, ...S.amountLow } : S.amount,
          title: row.resetAt ? new Date(row.resetAt).toLocaleString() : undefined,
        }, `${Math.round(pct)}%`)
      } else {
        valueEl = h('span', {
          style: S.muted,
          title: row.status === 'no-key' && row.keyRef ? `${t('row.noKey')}: ${row.keyRef}` : (row.detail || row.consoleUrl || ''),
        }, '--')
      }
      const showSetup = Boolean(row.keyRef) && (row.status === 'no-key' || row.status === 'expired')
      const setupTip = t('row.setupTip', { label: row.keyRef || row.label })
      // A row that needs a credential invites a click anywhere on its left side.
      const openSetup = showSetup ? { role: 'button', tabIndex: 0, style: { ...S.left, cursor: 'pointer' }, title: setupTip, onClick: () => onSetup(row.keyRef), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSetup(row.keyRef) } } } : { style: S.left }
      return h('div', { style: S.row },
        h('span', openSetup,
          h('a', {
            href: row.consoleUrl || undefined,
            target: '_blank',
            rel: 'noreferrer noopener',
            style: S.name,
            title: row.consoleUrl || row.label,
          }, row.label),
          peak === null
            ? null
            : h('span', {
              style: {
                ...S.dot,
                background: peak
                  ? 'var(--dsw-alias-state-error-primary, #dc4446)'
                  : 'var(--dsw-alias-state-success-primary, #49aa19)',
              },
              title: peak
                ? t('row.peakTip', { windows: peakWindowsText(row.peakSchedule) })
                : t('row.offPeakTip'),
            })),
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
          Number.isFinite(row.todayDelta) && row.todayDelta > 0
            ? h('span', { style: S.delta, title: `${t('row.today')} ${money(row.todayDelta, row.currency)}` },
              `-${money(row.todayDelta, row.currency)}`)
            : null,
          showSetup
            ? h('button', { type: 'button', style: S.gear, title: t('card.setup'), onClick: () => onSetup(row.keyRef) }, '⚙')
            : null,
          valueEl))
    }

    // ---------- collapsible box ----------
    /** Click the header (or the chevron) to fold a section away. */
    function Section(props) {
      const { id, title, collapsed, onToggle, right, t, children } = props
      const hint = collapsed ? t('card.expandTitle') : t('card.collapseTitle')
      return h('section', { style: S.box, 'data-section': id },
        h('div', { style: S.header },
          h('button', {
            type: 'button',
            style: S.headerButton,
            onClick: onToggle,
            'aria-expanded': collapsed ? 'false' : 'true',
            'aria-controls': `dsh-balance-${id}`,
            title: hint,
          },
            h('span', { style: { ...S.chevron, transform: collapsed ? 'rotate(-90deg)' : 'none' } }, '▾'),
            h('span', { style: S.title }, title)),
          right || null),
        collapsed ? null : h('div', { id: `dsh-balance-${id}`, style: S.body }, children))
    }

    // ---------- setup view ----------
    function SecretForm(props) {
      const { entry, t, value, setValue, busy, result, onSave, onClear, onForce, onClose } = props
      const isCookie = entry.type === 'cookie'
      return h('div', null,
        h('div', { style: S.row },
          h('span', { style: S.left },
            h('span', { style: { ...S.name, cursor: 'default' } }, entry.label),
            h('span', { style: { ...S.muted, fontSize: '10px' } }, entry.ref)),
          h('span', { style: entry.set ? S.ok : S.muted }, entry.set ? t('setup.stored') : t('setup.missing'))),
        h('textarea', {
          rows: isCookie ? 3 : 1,
          style: { ...S.input, resize: 'vertical', minHeight: isCookie ? '44px' : undefined },
          placeholder: isCookie ? t('setup.cookiePlaceholder') : t('setup.keyPlaceholder'),
          value,
          spellCheck: false,
          autoComplete: 'off',
          onChange: (event) => setValue(event.target.value),
        }),
        h('div', { style: S.mutedSmall }, isCookie ? t('setup.howToCookie') : t('setup.howToKey'), ' ', t('setup.neverShown')),
        h('div', { style: S.buttonRow },
          h('button', { type: 'button', style: S.buttonPrimary, disabled: busy || !value.trim(), onClick: onSave },
            busy ? t('setup.testing') : t('setup.save')),
          entry.consoleUrl
            ? h('a', { href: entry.consoleUrl, target: '_blank', rel: 'noreferrer noopener', style: { ...S.button, textDecoration: 'none' } },
              t('setup.open'))
            : null,
          entry.set
            ? h('button', { type: 'button', style: S.button, disabled: busy, onClick: onClear }, t('setup.clear'))
            : null,
          onClose ? h('button', { type: 'button', style: S.button, onClick: onClose }, t('setup.fold')) : null),
        result && result.ok ? h('div', { style: S.ok }, `${result.saved ? t('setup.saved') : t('setup.cleared')}${result.plan ? ` · ${result.plan}` : ''}`) : null,
        result && result.ok === false
          ? h('div', null,
            h('div', { style: S.err }, result.error || t('row.failed')),
            result.canForce
              ? h('button', { type: 'button', style: { ...S.button, marginTop: '4px' }, onClick: onForce }, t('setup.forceSave'))
              : null)
          : null)
    }

    function SetupView(props) {
      const { t, entries, onBack, focusRef } = props
      const [values, setValues] = React.useState({})
      const [busy, setBusy] = React.useState({})
      const [results, setResults] = React.useState({})
      const [focus, setFocus] = React.useState(focusRef || null)

      // Only the requested provider is expanded; the rest stay behind a row.
      React.useEffect(() => { setFocus(focusRef || null) }, [focusRef])

      const post = React.useCallback(async (id, payload) => {
        setBusy((prev) => ({ ...prev, [id]: true }))
        try {
          const response = await fetch(SECRET_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...payload }),
          })
          const body = await response.json().catch(() => null)
          return body || { ok: false, error: `HTTP ${response.status}` }
        } catch (err) {
          return { ok: false, error: String((err && err.message) || err) }
        } finally {
          setBusy((prev) => ({ ...prev, [id]: false }))
        }
      }, [])

      const save = React.useCallback(async (entry, force) => {
        const body = await post(entry.id, { action: 'save', value: values[entry.ref] || '', force: Boolean(force) })
        // A failed format check is not something "save anyway" can fix.
        const canForce = body.ok === false && body.saved === false && !String(body.error || '').includes('look like')
        setResults((prev) => ({ ...prev, [entry.ref]: { ...body, canForce } }))
        if (body.ok) setValues((prev) => ({ ...prev, [entry.ref]: '' }))
      }, [post, values])

      const clear = React.useCallback(async (entry) => {
        const body = await post(entry.id, { action: 'clear' })
        setResults((prev) => ({ ...prev, [entry.ref]: body.ok ? { ok: true, cleared: true } : body }))
      }, [post])

      return h(React.Fragment, null,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          h('span', { style: S.title }, t('setup.title')),
          h('button', { type: 'button', style: S.button, onClick: onBack }, t('setup.back'))),
        h('div', { style: S.mutedSmall }, t('setup.subtitle')),
        entries.length === 0 ? h('div', { style: S.mutedSmall }, t('card.empty')) : null,
        entries.map((entry, index) => h('div', { key: entry.id },
          index > 0 ? h('div', { style: S.sep }) : null,
          focus && focus !== entry.ref
            ? h('div', { style: S.row },
              h('span', { style: S.left },
                h('span', { style: { ...S.name, cursor: 'pointer' }, onClick: () => setFocus(entry.ref) }, entry.label),
                h('span', { style: { ...S.muted, fontSize: '10px' } }, entry.ref)),
              h('span', { style: entry.set ? S.ok : S.muted, cursor: 'pointer', onClick: () => setFocus(entry.ref) },
                entry.set ? t('setup.stored') : t('setup.missing')))
            : h(SecretForm, {
              entry,
              t,
              value: values[entry.ref] || '',
              setValue: (next) => setValues((prev) => ({ ...prev, [entry.ref]: next })),
              busy: Boolean(busy[entry.id]),
              result: results[entry.ref] || null,
              onSave: () => save(entry, false),
              onForce: () => save(entry, true),
              onClear: () => clear(entry),
              onClose: focus ? () => setFocus(null) : null,
            }))))
    }

    // ---------- the card ----------
    function readCollapsed() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function BalanceWidget(props) {
      const ctx = props.slotContext
      const wide = props.wide !== false
      const t = useTranslator(ctx)

      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [anchor, setAnchor] = React.useState(null)
      const [tick, setTick] = React.useState(0)
      const [collapsed, setCollapsed] = React.useState(readCollapsed)
      const [setup, setSetup] = React.useState(null) // null | { entries, focusRef }
      const markerRef = React.useRef(null)

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(ENDPOINT, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (!payload || !payload.ok) throw new Error('bad payload')
          setData(payload)
          setError(null)
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [])

      const fetchSetup = React.useCallback(async () => {
        try {
          const response = await fetch(SETUP_ENDPOINT, { cache: 'no-store' })
          if (!response.ok) return []
          const payload = await response.json()
          return payload && Array.isArray(payload.entries) ? payload.entries : []
        } catch {
          return []
        }
      }, [])

      React.useEffect(() => {
        load()
        const poll = setInterval(load, POLL_MS)
        const beat = setInterval(() => setTick((value) => value + 1), TICK_MS)
        return () => {
          clearInterval(poll)
          clearInterval(beat)
        }
      }, [load])

      const toggle = React.useCallback((key) => {
        setCollapsed((prev) => {
          const next = { ...prev, [key]: !prev[key] }
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
          return next
        })
      }, [])

      const [handoff, setHandoff] = React.useState(false)
      // The full setup form lives in Settings -> Plugins (there is room to read
      // there). This card only hands the focus over; if the settings dialog is
      // out of reach the card falls back to its own compact form.
      const openSetup = React.useCallback(async (focusRef) => {
        if (await requestSetupTab(focusRef)) { setHandoff(true); return }
        setSetup({ entries: null, focusRef: focusRef || null })
        const entries = await fetchSetup()
        setSetup({ entries, focusRef: focusRef || null })
      }, [fetchSetup])

      React.useEffect(() => {
        if (!handoff) return undefined
        const timer = setTimeout(() => setHandoff(false), 4000)
        return () => clearTimeout(timer)
      }, [handoff])

      const closeSetup = React.useCallback(() => {
        setSetup(null)
        load()
      }, [load])

      // Anchor the fixed card above the whole footer action row so it never
      // covers the shipped sidebar buttons beside it.
      React.useEffect(() => {
        const measure = () => {
          const node = markerRef.current
          if (!node || typeof node.getBoundingClientRect !== 'function') return
          const rect = node.getBoundingClientRect()
          if (!rect || !Number.isFinite(rect.top)) return
          let column = null
          let footArea = null
          let parent = node.parentElement
          for (let depth = 0; parent && depth < 12; depth += 1) {
            const box = parent.getBoundingClientRect()
            if (box && box.width >= 180 && box.width <= 460 && box.left < 80) column = box
            if (/footArea|footer/i.test(String(parent.className || '')) && box) footArea = box
            parent = parent.parentElement
          }
          const left = Math.max(8, Math.round(column ? column.left : rect.left))
          const topReference = footArea && footArea.top ? footArea.top : rect.top
          const available = Math.max(180, Math.round(window.innerWidth - left - 12))
          setAnchor({
            left,
            bottom: Math.max(8, Math.round(window.innerHeight - topReference + 6)),
            width: Math.min(wide ? 268 : 244, available),
          })
        }
        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        return () => {
          window.removeEventListener('resize', measure)
          window.removeEventListener('scroll', measure, true)
        }
      }, [wide])

      const rows = data && Array.isArray(data.rows) ? data.rows : []
      const planRows = rows.filter((row) => row.kind === 'plan')
      const balanceRows = rows.filter((row) => row.kind !== 'plan')
      const thirdParty = data && Array.isArray(data.thirdParty) ? data.thirdParty : []
      const now = new Date()
      const stamp = data && data.updatedAt ? `${t('card.updated')} ${clock(data.updatedAt)}` : null

      const section = (key, title, extra) => h(Section, {
        key,
        id: key,
        title,
        t,
        collapsed: Boolean(collapsed[key]),
        onToggle: () => toggle(key),
        right: extra,
      })

      const cards = []
      if (setup) {
        cards.push(h('div', { key: 'setup', style: S.box },
          setup.entries ? h(SetupView, { t, entries: setup.entries, onBack: closeSetup })
            : h('div', { style: S.muted }, t('card.loading'))))
      } else {
        if (planRows.length > 0) {
          const children = []
          planRows.forEach((row, index) => {
            if (index > 0) children.push(h('div', { key: `sep-${row.id}`, style: S.sep }))
            children.push(h(PlanSection, { key: row.id, row, t, now }))
          })
          cards.push(section('plan', t('card.planTitle'),
            h('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
              stamp ? h('span', { style: S.stamp }, stamp) : null,
              h('button', { type: 'button', style: S.gear, title: t('card.setup'), onClick: () => openSetup() }, '⚙')),
            children))
        }
        if (balanceRows.length > 0) {
          cards.push(section('balance', t('card.balanceTitle'),
            planRows.length > 0 ? null : (stamp ? h('span', { style: S.stamp }, stamp) : null),
            balanceRows.map((row) => h(BalanceRow, { key: row.id, row, t, now, onSetup: openSetup }))))
        }
        if (thirdParty.length > 0) {
          cards.push(section('third', t('card.thirdTitle'), null,
            thirdParty.map((item) => h(ThirdPartyRow, { key: item.id, item }))))
        }
        if (cards.length === 0) {
          cards.push(h('div', { key: 'empty', style: S.box },
            h('div', { style: S.muted }, data ? t('card.empty') : t('card.loading'))))
        }
        if (error) {
          cards.push(h('div', { key: 'err', style: S.box }, h('div', { style: S.err }, `${t('card.refreshErr')}${error}`)))
        }
        if (handoff) {
          cards.push(h('div', { key: 'handoff', style: S.box },
            h('div', { style: S.muted }, t('setup.handoff'))))
        }
      }

      const style = anchor
        ? { ...S.wrap, left: `${anchor.left}px`, bottom: `${anchor.bottom}px`, width: `${anchor.width}px` }
        : { ...S.wrap, left: '12px', bottom: '64px', width: '260px' }

      return h(React.Fragment, null,
        h('span', { ref: markerRef, style: S.marker, 'aria-hidden': true }),
        h('div', {
          style,
          role: 'region',
          'aria-label': t('card.balanceTitle'),
          'data-tick': tick,
        }, cards))
    }

    /** `focus`: open the settings dialog for this ref (see `requestSetupTab`). */
    async function requestSetupTab(ref) {
      try { window.localStorage.setItem(SETUP_PENDING_KEY, ref || '') } catch { return false }
      const ui = GLOBAL_UI && GLOBAL_UI.settings
      if (ui && typeof ui.open === 'function') {
        try {
          await ui.open('plugins')
          return true
        } catch { /* the tab reads the flag on its next mount anyway */ }
      }
      return false
    }

    /** The same setup form, with room to read (Settings → Plugins). */
    function BalanceSettingsTab(props) {
      const ctx = props.slotContext
      const t = useTranslator(ctx)
      const [entries, setEntries] = React.useState(null)
      const [focus, setFocus] = React.useState(() => {
        try {
          const pending = window.localStorage.getItem(SETUP_PENDING_KEY)
          if (pending !== null) window.localStorage.removeItem(SETUP_PENDING_KEY)
          return pending || null
        } catch {
          return null
        }
      })
      React.useEffect(() => {
        let alive = true
        fetch(SETUP_ENDPOINT, { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => { if (alive) setEntries(payload && Array.isArray(payload.entries) ? payload.entries : []) })
          .catch(() => { if (alive) setEntries([]) })
        return () => { alive = false }
      }, [])
      if (!entries) return h('div', { style: S.muted }, t('card.loading'))
      return h('div', { style: { maxWidth: '520px', fontSize: '12px' } },
        h(SetupView, { t, entries, focusRef: focus, onBack: () => setFocus(null) }))
    }

    /** Every contribution is guarded so one failure cannot break the loader. */
    function guard(label, fn) {
      try {
        return fn()
      } catch (err) {
        console.error(`[dsh-balance-display] ${label} failed`, err)
        return undefined
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        if (ctx && ctx.locale && typeof ctx.locale.register === 'function') {
          guard('locale', () => ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'dsh-balance-display: locale'))
        }
        guard('sidebar card', () => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'balance-display',
          order: -10,
          label: () => translate(readLocale(ctx), 'card.balanceTitle'),
          locale: NAMESPACE,
        }, (props) => h(BalanceWidget, { ...props, slotContext: ctx }))))

        // Settings → Plugins → Balance display: the same setup view, with room
        // to read. Optional: the card's gear works on its own.
        guard('settings tab', () => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'dsh-balance-display',
          order: 30,
          label: () => translate(readLocale(ctx), 'card.balanceTitle'),
          locale: NAMESPACE,
        }, (props) => h(BalanceSettingsTab, { ...props, slotContext: ctx }))))
      },
    }
  },
})