#!/usr/bin/env node
/**
 * Store the Qwen Token Plan console cookie without opening the UI.
 *
 *   dsh-balance-qwen-cookie                 # read the cookie from stdin
 *   dsh-balance-qwen-cookie --paste         # prompt on the terminal
 *   dsh-balance-qwen-cookie --from-copy     # read the system clipboard
 *   dsh-balance-qwen-cookie --stdin < file  # same as reading stdin
 *   dsh-balance-qwen-cookie --check         # only validate what is stored
 *   dsh-balance-qwen-cookie --remove        # delete the stored cookie
 *
 * The value is validated against the Qwen gateway before it is written, so a
 * stale copy fails here instead of showing "登录已过期" in the sidebar later.
 * Nothing is printed but a masked hint.
 */
import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'

import { qwenValidate } from '../lib/providers/qwen-plan.js'
import { normalizeCookie } from '../lib/secrets.js'
import { mask, readRef, storePath, writeRef } from './lib/credentials.mjs'

const REF = 'QWEN_TOKEN_PLAN_COOKIE'
const HELP = `dsh-balance-qwen-cookie — store the Qwen Token Plan console cookie

Usage: dsh-balance-qwen-cookie [--stdin | --paste | --from-copy] [--force]
       dsh-balance-qwen-cookie --check
       dsh-balance-qwen-cookie --remove

  --stdin       read the cookie from standard input (the default)
  --paste       prompt and read without echoing pasted text to the screen
  --from-copy   read the system clipboard (Windows, macOS, Linux wl-clipboard)
  --force       store the cookie even if validation fails
  --check       validate the stored cookie and exit
  --remove      delete the stored cookie
  --help        show this text

Where to copy it from: open https://platform.qianwenai.com/home/billing/subscription/token-plan
while signed in, open the browser devtools → Network, pick any request to
platform.qianwenai.com, and copy the whole "Cookie:" request header.
`

const argv = new Set(process.argv.slice(2))

function fail(message, code = 1) {
  process.stderr.write(`✖ ${message}\n`)
  process.exit(code)
}

function fromClipboard() {
  const tryRun = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) return null
    return result.stdout
  }
  if (process.platform === 'win32') return tryRun('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'])
  if (process.platform === 'darwin') return tryRun('pbpaste', [])
  const wayland = tryRun('wl-paste', ['--no-newline'])
  return wayland ?? tryRun('xclip', ['-selection', 'clipboard', '-o'])
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    let text = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      text += chunk
    })
    process.stdin.on('end', () => resolve(text))
    process.stdin.on('error', reject)
  })
}

/** Read a line without echoing it, so a pasted cookie stays off screen. */
function readHidden(prompt) {
  process.stdout.write(prompt)
  const tty = process.stdin.isTTY
  if (tty && process.stdin.setRawMode) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    return new Promise((resolve) => {
      let text = ''
      const onData = (chunk) => {
        for (const char of chunk.toString('utf8')) {
          if (char === '\r' || char === '\n') {
            process.stdin.removeListener('data', onData)
            process.stdin.setRawMode(false)
            process.stdin.pause()
            process.stdout.write('\n')
            resolve(text)
            return
          }
          if (char === '\u0003') {
            process.stdin.setRawMode(false)
            process.stdout.write('\n')
            process.exit(130)
          }
          if (char === '\u007f' || char === '\b') text = text.slice(0, -1)
          else text += char
        }
      }
      process.stdin.on('data', onData)
    })
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question('', (answer) => {
    rl.close()
    resolve(answer)
  }))
}

function describe(result) {
  if (result.ok) return `ok${result.plan ? ` (${result.plan})` : ''}`
  if (result.status === 'expired') return 'stale — sign in again and copy a fresh cookie'
  return `rejected by the gateway${result.message ? ` (${result.message})` : ''}`
}

async function validate(cookie) {
  try {
    return (await qwenValidate(cookie)) || { ok: false, status: 'error' }
  } catch (error) {
    return { ok: false, status: 'error', message: error?.message || String(error) }
  }
}

async function check() {
  const file = storePath()
  if (!file) fail('no DSH credential store found; set DSH_CREDENTIALS_FILE')
  const cookie = readRef(REF, file)
  if (!cookie) {
    process.stdout.write(`• ${REF} is not set (${file})\n`)
    return 0
  }
  process.stdout.write(`• ${REF} = ${mask(cookie)} in ${file}\n`)
  const result = await validate(cookie)
  process.stdout.write(`• gateway says: ${describe(result)}\n`)
  return result.ok ? 0 : 2
}

async function main() {
  if (argv.has('--help') || argv.has('-h')) {
    process.stdout.write(HELP)
    return 0
  }
  if (argv.has('--check')) return check()
  if (argv.has('--remove')) {
    const file = storePath()
    if (!file) fail('no DSH credential store found; set DSH_CREDENTIALS_FILE')
    writeRef(REF, '', file)
    process.stdout.write(`✔ cleared ${REF}\n`)
    return 0
  }

  const file = storePath()
  if (!file) fail('no DSH credential store found; set DSH_CREDENTIALS_FILE to the file to write')

  let raw = ''
  if (argv.has('--from-copy')) {
    raw = fromClipboard() || ''
    if (!raw.trim()) fail('the clipboard is empty')
  } else if (argv.has('--paste')) {
    raw = await readHidden('Paste the Cookie header, then press Enter (input is hidden): ')
  } else {
    raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write(HELP)
      fail('no cookie on stdin; use --paste or --from-copy')
    }
  }

  const cookie = normalizeCookie(raw)
  if (!cookie.includes('=')) fail(`that does not look like a Cookie header (${mask(cookie)})`)

  const result = await validate(cookie)
  if (!result.ok && !argv.has('--force')) {
    fail(`the gateway did not accept this cookie: ${describe(result)}. Use --force to store it anyway.`)
  }
  writeRef(REF, cookie, file)
  process.stdout.write(`✔ stored ${REF} = ${mask(cookie)} in ${file}\n`)
  if (!result.ok) process.stdout.write('  (unvalidated — stored because of --force)\n')
  return 0
}

main().then((code) => {
  process.exitCode = code
}).catch((error) => {
  fail(error?.stack || String(error))
})