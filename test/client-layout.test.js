/**
 * The card is browser-only code, but its layout math and collapsed-state
 * helpers are pure. Load client.js in a VM with a stub ModuleLoader so the
 * sidebar-width and folding contracts can be regression-tested without
 * Electron.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

function loadClient(storedCollapsed = null) {
  let definition = null
  const storage = {
    value: storedCollapsed,
    removed: false,
    written: null,
    getItem(key) { return key === 'dsh-balance-display:collapsed' ? this.value : null },
    setItem(key, value) { if (key === 'dsh-balance-display:collapsed') this.written = value },
    removeItem(key) { if (key === 'dsh-balance-display:collapsed') this.removed = true },
  }
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: { load: (def) => { definition = def } },
      localStorage: storage,
    },
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(definition, 'client.js must register a module')
  const reactStub = {
    createElement() {},
    useState() {},
    useEffect() {},
    useCallback(fn) { return fn },
    useRef() { return { current: null } },
    Fragment: 'react-fragment',
  }
  const requireStub = (name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require("${name}")`)
  }
  const exports_ = definition.factory(requireStub)
  return { exports: exports_, storage }
}

const plugin = loadClient().exports
const geometry = plugin.cardGeometry
const viewport = { viewportWidth: 1440, viewportHeight: 900, wide: true }
const marker = { left: 35, top: 800 }
// Objects created inside the VM have a foreign prototype; spread them back
// into this realm before deep-comparing.
const plain = (value) => ({ ...value })

test('card width is derived from the sidebar column, never a fixed number', () => {
  const wideBar = geometry({ column: { left: 20, width: 300 }, marker, footerTop: NaN, ...viewport })
  const narrowBar = geometry({ column: { left: 20, width: 210 }, marker, footerTop: NaN, ...viewport })

  assert.equal(wideBar.width, 280)
  assert.equal(wideBar.left, 30)
  assert.equal(wideBar.left + wideBar.width, 310, 'card must stay inside a 20..320 sidebar')
  assert.equal(narrowBar.width, 190)
  assert.equal(narrowBar.left + narrowBar.width, 220, 'card must stay inside a 20..230 sidebar')
  assert.ok(wideBar.width > narrowBar.width, 'dragging the sidebar wider must widen the card')
})

test('an icon-only rail hides the card instead of overflowing it', () => {
  assert.equal(geometry({ column: { left: 0, width: 64 }, marker, footerTop: NaN, ...viewport }).hidden, true)
  assert.equal(geometry({ column: null, marker, footerTop: NaN, ...viewport }).hidden, undefined)
})

test('a bogus footer ancestor cannot push the card off screen', () => {
  const normal = geometry({ column: { left: 20, width: 300 }, marker, footerTop: NaN, ...viewport })
  const bogus = geometry({ column: { left: 20, width: 300 }, marker, footerTop: 0, ...viewport })
  const realFooter = geometry({ column: { left: 20, width: 300 }, marker, footerTop: 700, ...viewport })
  assert.equal(normal.bottom, 106)
  assert.equal(bogus.bottom, normal.bottom)
  assert.equal(realFooter.bottom, 206)
  assert.ok(normal.bottom <= Math.round(viewport.viewportHeight * 0.35))
})

test('the card starts fully folded, and sparse legacy state folds missing keys', () => {
  const folded = { plan: true, balance: true, third: true }
  const open = { plan: false, balance: false, third: false }

  assert.deepEqual(plain(plugin.readCollapsed()), folded)
  assert.deepEqual(plain(loadClient('{}').exports.readCollapsed()), folded)
  assert.deepEqual(plain(loadClient('{"plan":false}').exports.readCollapsed()), { plan: false, balance: true, third: true })
  assert.deepEqual(plain(loadClient(JSON.stringify(open)).exports.readCollapsed()), open)
  assert.deepEqual(plain(loadClient('not json').exports.readCollapsed()), folded)

  // All three folded is a legitimate state, not something to "heal" away.
  const stored = loadClient(JSON.stringify(folded))
  assert.deepEqual(plain(stored.exports.readCollapsed()), folded)
  assert.equal(stored.storage.removed, false)
})

test('folding the third section no longer reopens the other two', () => {
  const toggle = plugin.toggleCollapsed
  let state = { plan: false, balance: false, third: false }

  state = toggle(state, 'plan')
  assert.deepEqual(plain(state), { plan: true, balance: false, third: false })
  state = toggle(state, 'balance')
  assert.deepEqual(plain(state), { plan: true, balance: true, third: false })
  state = toggle(state, 'third')
  assert.deepEqual(plain(state), { plan: true, balance: true, third: true },
    'the third fold must leave all three folded, not reset the card')
  state = toggle(state, 'plan')
  assert.deepEqual(plain(state), { plan: false, balance: true, third: true },
    'reopening one section must not touch the others')

  assert.equal(toggle({}, 'plan').plan, false, 'sparse legacy state behaves like all-folded')
  assert.doesNotMatch(source, /last visible section/i, 'the old reset guard must not come back')
  assert.doesNotMatch(source, /removeItem\(STORAGE_KEY\)/)
  assert.doesNotMatch(source, /SECTION_KEYS\.every/)
  assert.match(source, /setItem\(STORAGE_KEY, JSON\.stringify\(next\)\)/)
})

test('section bodies are actually passed to the Section component', () => {
  // The regression: `section(key, title, extra, children)` accepted children
  // but built the element without them, leaving three empty boxes.
  assert.match(source, /const section = \(key, title, extra, children\) => h\(Section, \{[\s\S]*?\}, children\)/)
  assert.doesNotMatch(source, /width: Math\.min\(wide \? 268/)
  assert.match(source, /ResizeObserver/)
})

test('the settings gear is completely hidden, with an alternative entry kept', () => {
  assert.equal(plugin.SHOW_SETUP_GEAR, false)
  const gears = [...source.matchAll(/'⚙'/g)]
  assert.equal(gears.length, 2, 'header gear and row gear must both be gated')
  for (const gear of gears) {
    const before = source.slice(Math.max(0, gear.index - 400), gear.index)
    assert.match(before, /SHOW_SETUP_GEAR/, 'every gear glyph must be behind SHOW_SETUP_GEAR')
  }
  // Settings → Plugins → 余额显示 stays registered as the config entry, and
  // a row missing a key is still clickable when the dialog is unreachable.
  assert.match(source, /settings\.plugins\.tab/)
  assert.match(source, /row\.setupTip/)
})
