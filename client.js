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
    const PEERS_ENDPOINT = '/dsh-balance/peers.json'
    // Stored credentials + the usage each one unlocks (the shared page).
    const SETTINGS_ENDPOINT = '/dsh-balance/settings.json'
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
      'ofm.credits': '剩余积分',
      'ofm.token': '剩余 Token',
      'ofm.dollars': '剩余余额（USD）',
      'ofm.quota': '剩余配额',
      'ofm.accounts': '已查询 {n} 个账号',
      'ofm.failed': '积分查询失败',
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
      'row.days': '剩 {n} 天',
      'row.today': '今日减少',
      'row.todayPlan': '今日已用',
      'row.peakTip': '高峰时段（{windows}），空闲时段半价',
      'row.offPeakTip': '当前为空闲时段',
      'row.setupTip': '点击这里填入 {label}',
      'row.night': '夜间 {discount} 折',
      'setup.handoff': '已打开「设置 → 插件 → 余额显示」，请在那里的表单中粘贴。',
      'set.subtitle': '有些用量只存在于已登录的控制台，API 密钥读不到。这里保存浏览器 Cookie 与配套令牌。',
      'set.none': '没有需要 Cookie 的服务商。',
      'set.optional': '可选',
      'set.console': '打开控制台',
      'set.add': '配置 Cookie',
      'set.update': '更新 Cookie',
      'set.clear': '清除',
      'set.save': '保存并测试',
      'set.saving': '测试中…',
      'set.cancel': '取消',
      'set.saved': '已保存，Cookie 可用',
      'set.cleared': '已清除。',
      'set.failed': '保存失败',
      'set.placeholder': '粘贴整段 Cookie 头，或 Cookie-Editor「Export As: JSON」的全部内容',
      'set.keyPlaceholder': '粘贴控制键（vela_ctrl_…）',
      'set.textPlaceholder': '工作区 ID（留空则自动读取）',
      'set.foot': 'Cookie 只写入本机 DSH 凭据库，不写入插件配置、日志或浏览器存储。',
      'set.used': '已用 {p}',
      'set.until': '至 {d}',
      'set.expired': 'Cookie 已失效，请重新粘贴。',
      'set.err': '读取失败',
      'set.retry': '重试',
      'set.hidden': '未取到用量',
      'set.pasteHint': '直接粘贴整段 Cookie 头，或 Cookie-Editor「Export As: JSON」的全部内容',
      'set.pasteLoaded': '已读入粘贴内容',
      'set.pasteEmpty': '没有读到内容，重新粘贴一次',
      'set.imported': '已导入 {n} 条 Cookie',
      'set.filtered': '（另有 {n} 条属于其他站点，已略过）',
    }
    const en = {
      'card.planTitle': 'Token plan',
      'card.balanceTitle': 'Balances',
      'card.thirdTitle': 'Third-party',
      'ofm.credits': 'Credits left',
      'ofm.token': 'Tokens left',
      'ofm.dollars': 'Balance left (USD)',
      'ofm.quota': 'Quota left',
      'ofm.accounts': '{n} accounts queried',
      'ofm.failed': 'Credit lookup failed',
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
      'row.days': '{n}d left',
      'row.today': 'used today',
      'row.todayPlan': 'used today',
      'row.peakTip': 'Peak hours ({windows}) — off-peak is half price',
      'row.offPeakTip': 'Off-peak right now',
      'row.setupTip': 'Click to add {label}',
      'row.night': 'Night {discount}× off',
      'setup.handoff': 'Opened Settings → Plugins → Balance display — paste it into the form there.',
      'set.subtitle': 'Some usage only exists behind a signed-in console; an API key cannot read it. Cookies and companion tokens live here.',
      'set.none': 'No provider needs a cookie.',
      'set.optional': 'optional',
      'set.console': 'Open console',
      'set.add': 'Add cookie',
      'set.update': 'Update cookie',
      'set.clear': 'Clear',
      'set.save': 'Save and test',
      'set.saving': 'Testing…',
      'set.cancel': 'Cancel',
      'set.saved': 'Saved — the cookie works',
      'set.cleared': 'Cleared.',
      'set.failed': 'Save failed',
      'set.placeholder': 'Paste the whole Cookie header, or everything Cookie-Editor “Export As: JSON” gives you',
      'set.keyPlaceholder': 'Paste the control key (vela_ctrl_…)',
      'set.textPlaceholder': 'Workspace id (read automatically when empty)',
      'set.foot': 'Cookies are written to the local DSH credential store only — never to the plugin config, the logs or browser storage.',
      'set.used': '{p} used',
      'set.until': 'until {d}',
      'set.expired': 'The cookie expired — paste a fresh one.',
      'set.err': 'Could not load',
      'set.retry': 'Retry',
      'set.hidden': 'No usage read',
      'set.pasteHint': 'Paste the whole Cookie header, or everything Cookie-Editor “Export As: JSON” gives you',
      'set.pasteLoaded': 'Pasted content loaded',
      'set.pasteEmpty': 'Nothing was read — paste it again',
      'set.imported': '{n} cookies imported',
      'set.filtered': ' ({n} more belong to other sites and were skipped)',
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
      // ---- credential page: the content is shared with dsh-model-panel ----
      page: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' },
      pageHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      pageTitle: { fontWeight: 600, fontSize: '13px' },
      pageSub: { color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.45))', fontSize: '11px', lineHeight: 1.5 },
      group: {
        fontSize: '10px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.4))',
        marginTop: '4px',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.1))',
        borderRadius: '10px',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.03))',
      },
      cardTop: { display: 'flex', alignItems: 'center', gap: '6px' },
      cardName: { fontWeight: 500, flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      cardOpt: { fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))' },
      pill: {
        marginLeft: 'auto',
        fontSize: '10px',
        borderRadius: '10px',
        padding: '1px 8px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.14))',
        color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.6))',
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      },
      pillOn: {
        color: 'var(--dsw-alias-state-success-primary, #49aa19)',
        borderColor: 'rgba(73,170,25,0.5)',
        background: 'rgba(73,170,25,0.12)',
      },
      cardMeta: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))' },
      cardCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', opacity: 0.85 },
      usage: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '11px' },
      usageErr: { fontSize: '11px', color: 'var(--dsw-alias-state-error-primary, #ff7875)' },
      usagePlan: { fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
      usageBar: {
        width: '96px',
        height: '5px',
        borderRadius: '3px',
        background: 'var(--dsw-alias-border-l1, rgba(255,255,255,0.1))',
        overflow: 'hidden',
        flex: '0 0 auto',
      },
      usageBarFill: { height: '100%', background: 'var(--dsw-alias-state-success-primary, #49aa19)', transition: 'width 0.3s ease' },
      usageBarLow: { background: 'var(--dsw-alias-state-error-primary, #ff7875)' },
      usagePct: { fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.65))' },
      usageUntil: { color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))' },
      usageWins: { display: 'inline-flex', gap: '8px', flexWrap: 'wrap' },
      usageWin: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
      usageWLabel: { fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.5))' },
      hintLine: { fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.5))' },
      actions: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' },
      note: { fontSize: '11px', color: 'var(--dsw-alias-state-success-primary, #49aa19)' },
      noteBad: { fontSize: '11px', color: 'var(--dsw-alias-state-error-primary, #ff7875)' },
      emptyLine: { color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.45))', fontSize: '11px', padding: '6px 0' },
      pasteHint: { fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,0.45))' },
      inputOver: { borderColor: 'var(--dsw-alias-brand-primary, #ffb366)', background: 'rgba(255,179,102,0.08)' },
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
        ? h('span', { style: S.deltaPct, title: `${t('row.todayPlan')} ${row.todayUsedPct}%` }, `↓${row.todayUsedPct}%`)
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
    /** 1.2K / 3.4M，与 our Free Model 卡片同一种缩写习惯。 */
    function compact(value) {
      const n = Math.round(Number(value) || 0)
      const abs = Math.abs(n)
      if (abs >= 1_000_000) return `${(n / 1e6).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
      if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10_000 ? 0 : 1)}K`
      return String(n)
    }

    /**
     * EAC router 行的右侧文案由本地目录拼出来（宿主不猜语言）；单位原样保留，
     * token / 积分 / 美元之间绝不互相折算。
     */
    function ofmLabel(item, t) {
      if (item.ok === false) return t('ofm.failed')
      if (item.unit === 'dollars') {
        return Number.isFinite(item.amount) ? `${t('ofm.dollars')} ${money(item.amount, 'USD')}` : t('ofm.failed')
      }
      if (item.unit === 'quota') {
        // Gemini 的 total 是百分比相加，不能当余额；有分桶就交给下面的进度条，
        // 没有分桶时退回「查询了几个账号」，不编一个总数。
        return Number.isFinite(item.remainPct)
          ? t('ofm.quota')
          : (item.accounts > 0 ? t('ofm.accounts', { n: item.accounts }) : t('ofm.failed'))
      }
      if (Number.isFinite(item.amount)) {
        const head = item.unit === 'token' ? t('ofm.token') : t('ofm.credits')
        return `${head} ${compact(item.amount)}`
      }
      if (Number.isFinite(item.remainPct)) {
        const head = item.unit === 'token' ? t('ofm.token') : t('ofm.credits')
        return `${head} ${pctText(item.remainPct)}`
      }
      return t('ofm.failed')
    }

    function ThirdPartyRow(props) {
      const { item, t } = props
      const pct = Number.isFinite(item.remainPct) ? Math.max(0, Math.min(100, item.remainPct)) : null
      const label = item.source === 'ofm'
        ? ofmLabel(item, t)
        : (item.label || (pct !== null ? `${Math.round(pct)}%` : ''))
      return h('div', null,
        h('div', { style: S.row },
          h('span', { style: S.left }, h('span', { style: S.name, title: item.kind || undefined }, item.name)),
          h('span', { style: S.amount }, label)),
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
    /**
     * Click the header (or the chevron) to fold a section away. The glyph is
     * always a down triangle: folded sections point down (they open downwards),
     * open ones are turned over so they point back up (they fold away).
     */
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
            h('span', { style: { ...S.chevron, transform: collapsed ? 'none' : 'rotate(180deg)' } }, '▾'),
            h('span', { style: S.title }, title)),
          right || null),
        collapsed ? null : h('div', { id: `dsh-balance-${id}`, style: S.body }, children))
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
      const markerRef = React.useRef(null)

      const toggle = React.useCallback((key) => {
        setCollapsed((prev) => {
          const next = toggleCollapsed(prev, key)
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
          return next
        })
      }, [])

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(ENDPOINT, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (!payload || !payload.ok) throw new Error('bad payload')
          rememberSharedSetup(payload.sharedSetup)
          setData(payload)
          setError(null)
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [])

      const [handoff, setHandoff] = React.useState(false)
      // One credential page exists, and it lives in Settings -> Plugins where
      // there is room to read. This card only hands the focus over; nothing is
      // duplicated here, so the two plugins cannot drift apart.
      const openSetup = React.useCallback(async (focusRef) => {
        if (await requestSetupTab(focusRef)) setHandoff(true)
      }, [])

      React.useEffect(() => {
        if (!handoff) return undefined
        const timer = setTimeout(() => setHandoff(false), 4000)
        return () => clearTimeout(timer)
      }, [handoff])

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
          thirdParty.map((item) => h(ThirdPartyRow, { key: item.id, item, t }))))
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

    /**
     * Does the peer plugin already draw the shared credential page? Its answer
     * rides on state.json, but the tab has to be registered before that
     * arrives, so the last answer is cached here and the first boot asks the
     * host once. Duplicate tabs are the failure mode this prevents.
     */
    const SHARED_KEY = 'dsh-balance-display:shared-setup'

    function readSharedSetup() {
      try {
        const text = window.localStorage.getItem(SHARED_KEY)
        return text ? JSON.parse(text) : null
      } catch {
        return null
      }
    }

    function rememberSharedSetup(state) {
      if (!state || typeof state !== 'object') return
      try { window.localStorage.setItem(SHARED_KEY, JSON.stringify(state)) } catch { /* private mode */ }
    }

    /** One question to the host: who owns the shared page right now. */
    async function loadSharedSetup() {
      const response = await fetch(PEERS_ENDPOINT, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      return (body && body.sharedSetup) || null
    }

    // ---------- the shared credential page (Settings → Plugins) ----------
    /**
     * This page is deliberately one thing: the credentials that unlock usage no
     * API key can read. Its content matches dsh-model-panel's page word for word
     * so the two plugins show the same screen — and when that plugin is loaded
     * it owns the tab, so this copy is never registered (see `sharedSetup` in
     * state.json and `apply` below).
     */

    function dayText(value) {
      const ms = Number(value)
      if (!Number.isFinite(ms) || ms <= 0) return ''
      try {
        return new Date(ms).toLocaleDateString()
      } catch {
        return ''
      }
    }

    /** What a stored credential bought us: plan, used bar, period end. */
    function usageLine(entry, t) {
      if (!entry.set) return null
      if (entry.status === 'error') {
        const detail = String(entry.detail || '')
        const expired = /expired|401|403|notlogined|登录|失效/i.test(detail)
        return h('div', { style: S.usageErr }, expired ? t('set.expired') : (detail || t('set.hidden')))
      }
      if (typeof entry.amount === 'number' && Number.isFinite(entry.amount)) {
        const bars = (Array.isArray(entry.windows) ? entry.windows : [])
          .filter((win) => Number.isFinite(win && win.remainPct))
        return h('div', { style: S.usage },
          h('span', { style: S.usagePlan }, money(entry.amount, entry.currency)),
          bars.length
            ? h('span', { style: S.usageWins }, bars.map((win, index) => h('span', {
              key: String(win.label || index),
              style: S.usageWin,
            },
              h('span', { style: S.usageWLabel }, String(win.label || '')),
              h('span', { style: S.usagePct }, pctText(Math.max(0, Math.min(100, 100 - win.remainPct)))))))
            : null)
      }
      const used = Number.isFinite(entry.usedPct) ? Math.max(0, Math.min(100, entry.usedPct)) : null
      const until = dayText(entry.endAt)
      return h('div', { style: S.usage },
        entry.plan ? h('span', { style: S.usagePlan }, String(entry.plan)) : null,
        used === null ? null : h('span', { style: S.usageBar, title: t('set.used', { p: pctText(used) }) },
          h('span', { style: { ...S.usageBarFill, width: `${used}%`, ...(used >= 90 ? S.usageBarLow : null) } })),
        used === null ? null : h('span', { style: S.usagePct }, pctText(used)),
        until ? h('span', { style: S.usageUntil }, t('set.until', { d: until })) : null,
        used === null && !entry.plan && !until ? h('span', { style: S.usageUntil }, t('set.hidden')) : null)
    }

    async function settingsRequest() {
      const response = await fetch(SETTINGS_ENDPOINT, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!body || typeof body !== 'object' || body.ok === false) {
        throw new Error(String((body && body.error) || `HTTP ${response.status}`))
      }
      return Array.isArray(body.entries) ? body.entries : []
    }

    async function secretRequest(id, action, value, ref) {
      const payload = { id, action }
      if (value !== undefined) payload.value = value
      if (ref) payload.ref = ref
      try {
        const response = await fetch(SECRET_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await response.json().catch(() => null)
        return body || { ok: false, error: `HTTP ${response.status}` }
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) }
      }
    }

    /**
     * Guarded boundary: a render crash in the page must degrade to a retry
     * line, never blank the settings dialog. Hosts without `React.Component`
     * (the Node-side layout test stubs React) simply get the page itself.
     */
    const SharedTabBoundary = typeof React.Component === 'function'
      ? class SharedTabBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { crashed: false, detail: '' }
        }

        static getDerivedStateFromError(error) {
          return { crashed: true, detail: String((error && error.message) || error) }
        }

        componentDidCatch(error) {
          try { console.warn('[dsh-balance-display] settings tab crashed:', error) } catch { /* best effort */ }
        }

        render() {
          const t = typeof this.props.t === 'function' ? this.props.t : (key) => String(key)
          if (!this.state.crashed) return h(CookieUsageTab, this.props)
          return h('div', { style: S.page },
            h('div', { style: S.noteBad }, `${t('set.err')}: ${this.state.detail}`),
            h('button', {
              type: 'button',
              style: { ...S.button, marginTop: '6px' },
              onClick: () => this.setState({ crashed: false, detail: '' }),
            }, t('set.retry')))
        }
      }
      : (props) => h(CookieUsageTab, props)

    /**
     * The page itself. Every row is one credential; a provider that owns
     * several declares them as a group so the page prints one heading.
     */
    function CookieUsageTab(props) {
      const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
      const [entries, setEntries] = React.useState(null)
      const [error, setError] = React.useState('')
      const [editing, setEditing] = React.useState('')
      const [draft, setDraft] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [note, setNote] = React.useState(null)
      const [drop, setDrop] = React.useState(false)

      const load = React.useCallback(() => {
        setError('')
        settingsRequest()
          .then((list) => setEntries(list))
          .catch((err) => {
            setError(String((err && err.message) || err))
            setEntries([])
          })
      }, [])
      React.useEffect(load, [load])

      function merge(entry) {
        if (!entry) return
        setEntries((prev) => (prev || []).map((item) => (
          item.ref === entry.ref ? Object.assign({}, item, entry) : item
        )))
      }

      async function save(entry) {
        setBusy(entry.ref)
        setNote(null)
        const body = await secretRequest(entry.id, 'save', draft, entry.ref)
        setBusy('')
        if (body.ok) {
          merge(body.entry)
          setEditing('')
          setDraft('')
          let got = ''
          if (body.imported && body.imported.count) {
            got = ' · ' + t('set.imported', { n: String(body.imported.count) })
            const aside = Number(body.imported.filteredOut) || 0
            if (aside > 0) got += t('set.filtered', { n: String(aside) })
          }
          setNote({ ok: true, text: t('set.saved') + got })
        } else {
          setNote({ ok: false, text: body.error || t('set.failed') })
        }
      }

      async function clear(entry) {
        setBusy(entry.ref)
        setNote(null)
        const body = await secretRequest(entry.id, 'clear', undefined, entry.ref)
        setBusy('')
        if (body.ok) {
          merge(body.entry)
          setNote({ ok: true, text: t('set.cleared') })
        } else {
          setNote({ ok: false, text: body.error || t('set.failed') })
        }
      }

      /** A dropped export is a convenience; pasting stays the documented path. */
      function loadFile(file) {
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          const text = String(reader.result || '').trim()
          if (!text) {
            setNote({ ok: false, text: t('set.pasteEmpty') })
            return
          }
          setDraft(text)
          setNote({ ok: true, text: t('set.pasteLoaded') })
        }
        reader.onerror = () => setNote({ ok: false, text: t('set.pasteEmpty') })
        reader.readAsText(file)
      }

      function renderCard(entry) {
        const open = editing === entry.ref
        const working = busy === entry.ref
        const placeholder = entry.placeholder
          || (entry.type === 'key'
            ? t('set.keyPlaceholder')
            : entry.type === 'text' ? t('set.textPlaceholder') : t('set.placeholder'))
        return h('div', { key: entry.ref, style: S.card },
          h('div', { style: S.cardTop },
            h('span', { style: S.cardName }, String(entry.label || entry.id)),
            entry.optional ? h('span', { style: S.cardOpt }, t('set.optional')) : null,
            h('span', { style: entry.set ? { ...S.pill, ...S.pillOn } : S.pill },
              entry.set ? t('set.stored') : t('set.missing'))),
          h('div', { style: S.cardMeta },
            h('code', { style: S.cardCode }, String(entry.ref || '')),
            entry.consoleUrl
              ? h('a', {
                href: entry.consoleUrl,
                target: '_blank',
                rel: 'noreferrer noopener',
                style: { color: 'var(--dsw-alias-brand-primary, #ffb366)' },
              }, t('set.console'))
              : null),
          entry.hint ? h('div', { style: S.hintLine }, String(entry.hint)) : null,
          usageLine(entry, t),
          open
            ? h('div', null,
              h('textarea', {
                rows: entry.type === 'cookie' ? 6 : 1,
                style: drop ? { ...S.input, ...S.inputOver } : S.input,
                spellCheck: false,
                autoComplete: 'off',
                placeholder,
                value: draft,
                onChange: (event) => setDraft(event.target.value),
                onDragOver: entry.type === 'cookie'
                  ? (event) => { event.preventDefault(); setDrop(true) }
                  : undefined,
                onDragLeave: entry.type === 'cookie' ? () => setDrop(false) : undefined,
                onDrop: entry.type === 'cookie'
                  ? (event) => {
                    event.preventDefault()
                    setDrop(false)
                    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
                    loadFile(file)
                  }
                  : undefined,
              }),
              entry.type === 'cookie' ? h('div', { style: S.pasteHint }, t('set.pasteHint')) : null,
              h('div', { style: S.actions },
                h('button', {
                  type: 'button',
                  style: S.buttonPrimary,
                  disabled: working || !draft.trim(),
                  onClick: () => save(entry),
                }, working ? t('set.saving') : t('set.save')),
                h('button', {
                  type: 'button',
                  style: S.button,
                  onClick: () => { setEditing(''); setDraft('') },
                }, t('set.cancel')))
            )
            : h('div', { style: S.actions },
              h('button', {
                type: 'button',
                style: S.buttonPrimary,
                onClick: () => { setEditing(entry.ref); setDraft(''); setNote(null) },
              }, entry.set ? t('set.update') : t('set.add')),
              entry.set
                ? h('button', {
                  type: 'button',
                  style: S.button,
                  disabled: working,
                  onClick: () => clear(entry),
                }, t('set.clear'))
                : null))
      }

      /** Rows arrive in host order; a new group prints one heading. */
      function renderRows(list) {
        const out = []
        let lastGroup = null
        for (const entry of list) {
          const group = entry.group ? String(entry.groupLabel || entry.group) : null
          if (group && group !== lastGroup) {
            out.push(h('div', { key: `g:${group}`, style: S.group }, group))
            lastGroup = group
          }
          out.push(renderCard(entry))
        }
        return out
      }

      return h('div', { style: S.page },
        h('div', { style: S.pageHead },
          h('div', { style: S.pageTitle }, t('settings.tabTitle')),
          h('button', { type: 'button', style: S.button, onClick: load }, t('set.retry'))),
        h('div', { style: S.pageSub }, t('set.subtitle')),
        error
          ? h('div', { style: S.noteBad }, `${t('set.err')}: ${error}`)
          : null,
        note ? h('div', { style: note.ok ? S.note : S.noteBad }, note.text) : null,
        entries === null ? h('div', { style: S.emptyLine }, t('card.loading')) : null,
        entries && entries.length === 0 ? h('div', { style: S.emptyLine }, t('set.none')) : null,
        entries ? renderRows(entries) : null,
        h('div', { style: S.pasteHint }, t('set.foot')))
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

          // Settings → Plugins: the shared credential page. When the peer
          // plugin is loaded it already draws this exact page, so registering
          // it here would show two identical tabs — the host answer comes from
          // state.json's `sharedSetup.ownsSetupTab`, and when it is true the
          // page is skipped instead of duplicated.
          guard('settings tab', () => {
            const myLocale = readLocale(withSlots)
            const own = () => withSlots.slots.inject('settings.plugins.tab', () => withSlots.slots.register({
              name: 'settings.plugins.tab',
              id: 'dsh-balance-display',
              order: 30,
              label: () => translate(myLocale, 'settings.tabTitle'),
              locale: NAMESPACE,
            }, (props) => h(SharedTabBoundary, {
              ...props,
              t: (key, vars) => translate(myLocale, key, vars),
              slotContext: withSlots,
            })))
            const peer = readSharedSetup()
            if (peer) {
              if (!peer.ownsSetupTab) own()
              return
            }
            // First boot on this machine: ask the host once, then remember.
            loadSharedSetup()
              .then((state) => {
                rememberSharedSetup(state)
                if (!state || !state.ownsSetupTab) own()
              })
              .catch(() => own())
          })
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
