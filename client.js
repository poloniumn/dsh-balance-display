/**
 * dsh-balance-display — client half.
 *
 * Registers a card in `sidebar.footer.action` (under the sidebar, beside the
 * shipped buttons). The card has three collapsible sections — Token Plan,
 * account balances and third-party channels — all folded on first load.
 * Credential setup lives in Settings → Plugins → 余额显示, so the card shows
 * no settings button; rows missing a key remain clickable as a fallback.
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
    // Credentials are managed in Settings → Plugins → 余额显示, so the card
    // itself is a read-only display: no gear in the header and none on rows.
    // Flip this to true only on hosts that have no settings dialog. Rows that
    // are missing a key stay clickable either way (see BalanceRow).
    const SHOW_SETUP_GEAR = false

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
      'settings.tabTitle': '余额显示',
      'card.emptyHelp': '在 DSH 后台启用模型服务商，或先在这里填入密钥。',
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
      'setup.close': '关闭',
      'setup.showAll': '显示全部服务商（{n}）',
      'setup.onlyEnabled': '只显示已启用',
      'setup.scopeHint': '默认只列出 DSH 后台已启用的服务商，以及已保存密钥的服务商。',
      'setup.disabledTag': '未启用',
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
      'settings.tabTitle': 'Balance display',
      'card.emptyHelp': 'Enable a model provider in DSH, or add a key here first.',
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
      'setup.close': 'Close',
      'setup.showAll': 'Show all vendors ({n})',
      'setup.onlyEnabled': 'Only enabled',
      'setup.scopeHint': 'By default only vendors enabled in DSH, plus ones with a saved key, are listed.',
      'setup.disabledTag': 'Not enabled',
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

    /**
     * Fixed-position cards do not inherit the sidebar's width. Derive every
     * number from the measured sidebar column so dragging the sidebar
     * narrower/wider resizes the card with it — a hard-coded 268px card used
     * to stick out past the sidebar border.
     *
     * `column` is the sidebar shell rect, `marker` the anchor rect inside the
     * footer slot. `footerTop` is optional and only trusted when it actually
     * sits above the marker (a mis-detected ancestor with top = 0 used to push
     * the whole card off screen).
     */
    function cardGeometry({ column, marker, viewportWidth, viewportHeight, footerTop, wide }) {
      const inset = 10
      const shell = column && Number.isFinite(column.width) && column.width > 0
        ? column
        : { left: marker.left, width: Math.min(260, Math.max(160, viewportWidth * 0.25)) }
      const width = Math.round(shell.width - inset * 2)
      // An icon-only rail has no usable room: hide instead of overflowing it.
      if (width < 150) return { hidden: true }
      const left = Math.max(8, Math.round(shell.left + inset))
      const reference = Number.isFinite(footerTop) && footerTop > 0 && footerTop < marker.top
        ? footerTop
        : marker.top
      const wanted = Math.round(viewportHeight - reference + 6)
      return {
        left,
        width: Math.max(150, Math.min(wide ? 460 : 320, width, viewportWidth - left - 8)),
        bottom: Math.max(8, Math.min(wanted, Math.round(viewportHeight * 0.35))),
      }
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
        overflowX: 'hidden',
        maxHeight: 'min(60vh, 480px)',
        boxSizing: 'border-box',
        maxWidth: '100%',
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
      // The setup form owns its own scroll area: the header (with the close
      // button) must never scroll out of reach, no matter how many vendors
      // are listed. Without this, two dozen expanded forms push the host's
      // settings dialog off screen.
      setupView: {
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'min(70vh, 520px)',
        minHeight: 0,
      },
      setupHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        flex: '0 0 auto',
        paddingBottom: '2px',
      },
      setupScroll: {
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '4px',
        boxSizing: 'border-box',
      },
      disabledTag: {
        fontSize: '10px',
        color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.12))',
        borderRadius: '4px',
        padding: '0 4px',
        flex: '0 0 auto',
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

    /**
     * Upstream adapters may return one or two short facts that are neither a
     * balance nor a window (wallet on the side, plan tier, expiry, debt).
     * They ride along as `notes` instead of being silently dropped.
     */
    function RowNotes(props) {
      const notes = Array.isArray(props.notes)
        ? props.notes.filter((note) => typeof note === 'string' && note.trim())
        : []
      if (!notes.length) return null
      return h('div', {
        style: { ...S.muted, fontSize: '11px', display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '2px 0 4px' },
      }, notes.map((note, index) => h('span', { key: `note-${index}` }, note)))
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
      children.push(RowNotes({ notes: row.notes }))

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
      return h('div', null,
        h('div', { style: S.row },
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
            showSetup && SHOW_SETUP_GEAR
              ? h('button', { type: 'button', style: S.gear, title: t('card.setup'), onClick: () => onSetup(row.keyRef) }, '⚙')
              : null,
            valueEl)),
        RowNotes({ notes: row.notes }))
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
      const { t, entries, onBack, focusRef, showAll, onToggleShowAll, total, backLabel } = props
      const [values, setValues] = React.useState({})
      const [busy, setBusy] = React.useState({})
      const [results, setResults] = React.useState({})
      const [focus, setFocus] = React.useState(focusRef || null)

      // At most ONE form is ever open. With the vendor catalogue at two dozen
      // entries, rendering every form at once made the settings dialog taller
      // than the window and put its close button out of reach.
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

      const list = entries.map((entry, index) => {
        const compact = h('div', { style: S.row, key: `row-${entry.id}` },
          h('span', { style: S.left },
            h('span', {
              style: { ...S.name, cursor: 'pointer' },
              title: t('row.setupTip', { label: entry.label }),
              onClick: () => setFocus(entry.ref),
            }, entry.label),
            entry.enabled === false ? h('span', { style: S.disabledTag }, t('setup.disabledTag')) : null,
            h('span', { style: { ...S.muted, fontSize: '10px' } }, entry.ref)),
          h('span', {
            style: { ...(entry.set ? S.ok : S.muted), marginTop: 0, cursor: 'pointer' },
            onClick: () => setFocus(entry.ref),
          }, entry.set ? t('setup.stored') : t('setup.missing')))

        return h('div', { key: entry.id },
          index > 0 ? h('div', { style: S.sep }) : null,
          focus === entry.ref
            ? h(SecretForm, {
              entry,
              t,
              value: values[entry.ref] || '',
              setValue: (next) => setValues((prev) => ({ ...prev, [entry.ref]: next })),
              busy: Boolean(busy[entry.id]),
              result: results[entry.ref] || null,
              onSave: () => save(entry, false),
              onForce: () => save(entry, true),
              onClear: () => clear(entry),
              onClose: () => setFocus(null),
            })
            : compact)
      })

      // Header stays outside the scroll area: the close/back button is always
      // visible even when every vendor in the catalogue is listed.
      return h('div', { style: S.setupView },
        h('div', { style: S.setupHeader },
          h('span', { style: S.title }, t('setup.title')),
          h('button', { type: 'button', style: S.button, onClick: onBack }, backLabel || t('setup.back'))),
        h('div', { style: S.setupScroll },
          h('div', { style: S.mutedSmall }, t('setup.subtitle')),
          h('div', { style: S.mutedSmall }, t('setup.scopeHint')),
          onToggleShowAll
            ? h('div', { style: { marginTop: '5px' } },
              h('button', { type: 'button', style: S.button, onClick: onToggleShowAll },
                showAll ? t('setup.onlyEnabled') : t('setup.showAll', { n: total || 0 })))
            : null,
          entries.length === 0
            ? h('div', { style: { ...S.mutedSmall, marginTop: '8px' } }, t('card.empty'))
            : null,
          list))
    }

    // ---------- the card ----------
    const SECTION_KEYS = ['plan', 'balance', 'third']

    /**
     * Collapsed state is sparse in older builds: only keys the user actually
     * touched were stored. A missing key means "collapsed", which is also the
     * initial state — the card starts as three compact headers.
     */
    function normalizeCollapsed(parsed) {
      const state = {}
      for (const key of SECTION_KEYS) {
        state[key] = parsed && typeof parsed === 'object' && key in parsed
          ? parsed[key] === true
          : true
      }
      return state
    }

    function readCollapsed() {
      try {
        return normalizeCollapsed(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'))
      } catch {
        return normalizeCollapsed(null)
      }
    }

    /**
     * Pure: folding one section never touches the other two. All three folded
     * is a valid state — the card then shows three compact headers only.
     */
    function toggleCollapsed(prev, key) {
      const current = normalizeCollapsed(prev)
      return { ...current, [key]: !current[key] }
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
      const [showAll, setShowAll] = React.useState(false)
      const [setupTotal, setSetupTotal] = React.useState(0)
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

      const fetchSetup = React.useCallback(async (includeAll) => {
        try {
          const response = await fetch(`${SETUP_ENDPOINT}${includeAll ? '?all=1' : ''}`, { cache: 'no-store' })
          if (!response.ok) return { entries: [], total: 0 }
          const payload = await response.json()
          return {
            entries: payload && Array.isArray(payload.entries) ? payload.entries : [],
            total: Number(payload && payload.total) || 0,
          }
        } catch {
          return { entries: [], total: 0 }
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
          const next = toggleCollapsed(prev, key)
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
        setShowAll(false)
        setSetup({ entries: null, focusRef: focusRef || null })
        const result = await fetchSetup(false)
        setSetupTotal(result.total)
        setSetup({ entries: result.entries, focusRef: focusRef || null })
      }, [fetchSetup])

      const toggleSetupScope = React.useCallback(async () => {
        const next = !showAll
        setShowAll(next)
        const result = await fetchSetup(next)
        setSetupTotal(result.total)
        setSetup((prev) => (prev ? { ...prev, entries: result.entries, focusRef: null } : prev))
      }, [showAll, fetchSetup])

      React.useEffect(() => {
        if (!handoff) return undefined
        const timer = setTimeout(() => setHandoff(false), 4000)
        return () => clearTimeout(timer)
      }, [handoff])

      const closeSetup = React.useCallback(() => {
        setSetup(null)
        load()
      }, [load])

      // The card is fixed above the footer, so it cannot inherit the
      // sidebar's width. Measure the sidebar shell and re-measure whenever it
      // is dragged narrower/wider (ResizeObserver), the window resizes, or the
      // sidebar collapses. A fixed 268px width used to stick out ~13px past
      // the sidebar border.
      React.useEffect(() => {
        let lastColumnNode = null
        const measure = () => {
          const node = markerRef.current
          if (!node || typeof node.getBoundingClientRect !== 'function') return
          const rect = node.getBoundingClientRect()
          if (!rect || !Number.isFinite(rect.top)) return
          let column = null
          let columnNode = null
          let footArea = null
          let parent = node.parentElement
          for (let depth = 0; parent && depth < 14; depth += 1) {
            const box = parent.getBoundingClientRect()
            // Outermost sidebar-like ancestor owns the resize handle.
            if (box && box.width >= 150 && box.width <= 520 && box.left < 80
              && (!column || box.width > column.width)) {
              column = box
              columnNode = parent
            }
            if (/footArea|footer/i.test(String(parent.className || '')) && box) footArea = box
            parent = parent.parentElement
          }
          lastColumnNode = columnNode
          const next = cardGeometry({
            column,
            marker: rect,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            footerTop: footArea ? footArea.top : NaN,
            wide,
          })
          // Avoid a state update (and a re-render) on every observer tick.
          setAnchor((prev) => {
            if (prev && prev.hidden === next.hidden && prev.left === next.left
              && prev.width === next.width && prev.bottom === next.bottom) return prev
            return next
          })
        }

        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        const observers = []
        if (typeof window.ResizeObserver === 'function') {
          const targets = [lastColumnNode, document.body].filter(Boolean)
          for (const target of new Set(targets)) {
            try {
              const observer = new window.ResizeObserver(measure)
              observer.observe(target)
              observers.push(observer)
            } catch { /* older hosts */ }
          }
        }
        // Safety net if the sidebar node is replaced by a React re-render.
        const poll = setInterval(measure, 1000)
        return () => {
          clearInterval(poll)
          window.removeEventListener('resize', measure)
          window.removeEventListener('scroll', measure, true)
          for (const observer of observers) {
            try { observer.disconnect() } catch { /* already gone */ }
          }
        }
      }, [wide])

      const rows = data && Array.isArray(data.rows) ? data.rows : []
      const planRows = rows.filter((row) => row.kind === 'plan')
      const balanceRows = rows.filter((row) => row.kind !== 'plan')
      const thirdParty = data && Array.isArray(data.thirdParty) ? data.thirdParty : []
      const now = new Date()
      const stamp = data && data.updatedAt ? `${t('card.updated')} ${clock(data.updatedAt)}` : null

      // The fourth argument is the section body. It used to be silently
      // dropped, leaving three collapsed-looking headers with empty boxes
      // below them even though state.json had returned every row.
      const section = (key, title, extra, children) => h(Section, {
        key,
        id: key,
        title,
        t,
        collapsed: Boolean(collapsed[key]),
        onToggle: () => toggle(key),
        right: extra,
      }, children)

      const cards = []
      if (setup) {
        cards.push(h('div', { key: 'setup', style: S.box },
          setup.entries
            ? h(SetupView, {
              t,
              entries: setup.entries,
              onBack: closeSetup,
              focusRef: setup.focusRef,
              showAll,
              total: setupTotal,
              onToggleShowAll: toggleSetupScope,
            })
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
              SHOW_SETUP_GEAR
                ? h('button', { type: 'button', style: S.gear, title: t('card.setup'), onClick: () => openSetup() }, '⚙')
                : null),
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
          // An empty card used to be a single faint line that looked like a
          // broken / unexpandable widget. Make the empty state actionable.
          cards.push(h('div', { key: 'empty', style: S.box },
            h('div', { style: S.muted }, data ? t('card.empty') : t('card.loading')),
            data ? h('div', { style: S.mutedSmall }, t('card.emptyHelp')) : null,
            data ? h('div', { style: { marginTop: '6px' } },
              h('button', { type: 'button', style: S.button, onClick: () => openSetup() }, t('card.setup')))
              : null))
        }
        if (error) {
          cards.push(h('div', { key: 'err', style: S.box }, h('div', { style: S.err }, `${t('card.refreshErr')}${error}`)))
        }
        if (handoff) {
          cards.push(h('div', { key: 'handoff', style: S.box },
            h('div', { style: S.muted }, t('setup.handoff'))))
        }
      }

      const style = anchor && !anchor.hidden
        ? { ...S.wrap, left: `${anchor.left}px`, bottom: `${anchor.bottom}px`, width: `${anchor.width}px` }
        : { ...S.wrap, left: '12px', bottom: '64px', width: 'min(240px, 30vw)' }

      // The marker must stay mounted so it can re-measure a collapsed sidebar
      // and bring the card back when the sidebar is widened again.
      if (anchor && anchor.hidden) {
        return h('span', { ref: markerRef, style: S.marker, 'aria-hidden': true })
      }

      return h(React.Fragment, null,
        h('span', { ref: markerRef, style: S.marker, 'aria-hidden': true }),
        h('div', {
          style,
          role: 'region',
          'aria-label': t('card.balanceTitle'),
          'data-tick': tick,
          'data-sidebar-width': anchor ? String(anchor.width) : undefined,
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
      const [total, setTotal] = React.useState(0)
      const [showAll, setShowAll] = React.useState(false)
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
        fetch(`${SETUP_ENDPOINT}${showAll ? '?all=1' : ''}`, { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => {
            if (!alive) return
            setEntries(payload && Array.isArray(payload.entries) ? payload.entries : [])
            setTotal(Number(payload && payload.total) || 0)
          })
          .catch(() => { if (alive) setEntries([]) })
        return () => { alive = false }
      }, [showAll])

      // "Back" used to only clear the focused form, which did nothing when no
      // form was open — the dialog stayed up with no reachable close control.
      const close = React.useCallback(() => {
        const ui = GLOBAL_UI && GLOBAL_UI.settings
        for (const method of ['close', 'closeSettings', 'dismiss']) {
          if (ui && typeof ui[method] === 'function') {
            try { ui[method]() } catch { /* keep the fallback below */ }
            break
          }
        }
        setFocus(null)
      }, [])

      if (!entries) return h('div', { style: S.muted }, t('card.loading'))
      return h('div', { style: { maxWidth: '520px', fontSize: '12px' } },
        h(SetupView, {
          t,
          entries,
          focusRef: focus,
          showAll,
          total,
          backLabel: t('setup.close'),
          onToggleShowAll: () => { setFocus(null); setShowAll((value) => !value) },
          onBack: close,
        }))
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

    /**
     * The web boot treats any loader entry still in `loading` as a fatal
     * startup failure, so this plugin declares NO required service and must
     * settle synchronously. UI contributions go through scoped `ctx.inject`
     * fibers instead: they wait for `slots` / `locale` on their own, without
     * holding the parent entry open when a service is not ready yet.
     */
    function scoped(ctx, services, label, fn) {
      if (typeof ctx.inject === 'function') {
        guard(label, () => ctx.inject(services, (scopedCtx) => { fn(scopedCtx) }))
      } else {
        // Older hosts without `ctx.inject`: try once, never throw.
        guard(label, () => { fn(ctx) })
      }
    }

    return {
      inject: [],
      // Pure layout math, the collapsed-state helpers and the visibility
      // flag are exposed so a Node-side regression test can verify them
      // without Electron.
      cardGeometry,
      readCollapsed,
      toggleCollapsed,
      SHOW_SETUP_GEAR,
      apply(ctx) {
        const mount = (withSlots) => {
          guard('sidebar card', () => { withSlots.slots.inject('sidebar.footer.action', () => withSlots.slots.register({
            name: 'sidebar.footer.action',
            id: 'balance-display',
            order: -10,
            label: () => translate(readLocale(withSlots), 'card.balanceTitle'),
            locale: NAMESPACE,
          }, (props) => h(BalanceWidget, { ...props, slotContext: withSlots }))) })

          // Settings → Plugins → Balance display: the same setup view, with
          // room to read. This is the only configuration entry point; the
          // card itself is a read-only display.
          guard('settings tab', () => { withSlots.slots.inject('settings.plugins.tab', () => withSlots.slots.register({
            name: 'settings.plugins.tab',
            id: 'dsh-balance-display',
            order: 30,
            label: () => translate(readLocale(withSlots), 'settings.tabTitle'),
            locale: NAMESPACE,
          }, (props) => h(BalanceSettingsTab, { ...props, slotContext: withSlots }))) })
        }

        scoped(ctx, ['locale'], 'locale', (withLocale) => {
          guard('locale', () => { withLocale.effect(() => withLocale.locale.register(NAMESPACE, { zh, en }), 'dsh-balance-display: locale') })
        })
        scoped(ctx, ['slots'], 'slots', (withSlots) => {
          if (!withSlots.slots || typeof withSlots.slots.inject !== 'function') return
          mount(withSlots)
        })
      },
    }
  },
})