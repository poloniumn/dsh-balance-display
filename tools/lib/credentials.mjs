/**
 * Read or write one entry of the DSH credential store file.
 *
 * The store is a small YAML document whose `refs:` block holds
 * `NAME: "value"` lines. A long value is written the way the YAML serializer in
 * DSH writes it: the opening quote sits on the first line, the continuation
 * lines are indented under the key, and the closing quote ends the last line.
 * That is why the readers below strip a trailing `"` as well as a leading one —
 * dropping it matters, because `JSON.parse` of a string ending in an odd number
 * of backslashes fails and the value would be returned with the quote attached.
 *
 * Rewriting a single entry keeps every other line (including the ones DSH
 * itself manages) untouched, which is why this helper exists instead of a YAML
 * round-trip: the file also contains comments and records a generic parser
 * would reformat.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** First credential file that exists, in DSH's documented order. */
export function storePath() {
  const home = homedir()
  const candidates = [
    process.env.DSH_CREDENTIALS_FILE,
    process.env.DSH_PROFILE_DIR && path.join(process.env.DSH_PROFILE_DIR, '.credentials.yaml'),
    process.env.DSH_HOME && path.join(process.env.DSH_HOME, '.credentials.yaml'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.dsh', '.credentials.yaml'),
    path.join(home, '.dsh', '.credentials.yaml'),
  ].filter(Boolean)
  return candidates.find((file) => existsSync(file)) || null
}

/** True when a line opens or continues a block scalar under `refs:`. */
function isIndented(line) {
  return /^\s+\S/.test(line) && !/^\S/.test(line)
}

/** Decode one YAML scalar as it appears in the store. */
function decode(raw) {
  // A folded value keeps a backslash-newline pair and the indent of every
  // continuation line; dropping both restores the original single line.
  const folded = raw.replace(/\\\s*\n\s*/g, '').replace(/\\\s*\n\s*/g, '')
  const text = folded.replace(/\s*\n\s*/g, ' ').trim()
  if (!text) return null
  if (text.startsWith('"')) {
    const body = text.replace(/^"/, '').replace(/"?$/, '')
    return body.replace(/\\"/g, '"')
  }
  return text.replace(/"?$/, '')
}

/** Value of one `refs:` entry, or null. */
export function readRef(ref, file = storePath()) {
  if (!file) return null
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const refsAt = lines.findIndex((line) => /^refs:\s*$/.test(line))
  if (refsAt < 0) return null
  const prefix = new RegExp(`^\\s+${ref}\\s*:\\s*(.*)$`)
  let value = null
  for (let index = refsAt + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\S/.test(line)) break // next top-level key ends the block
    const match = prefix.exec(line)
    if (match) {
      value = (match[1] || '').trim()
      const quoted = value.startsWith('"')
      // Keep reading continuation lines while the quote is still open.
      while (quoted && !/\\?"\s*$/.test(value) && index + 1 < lines.length && isIndented(lines[index + 1])) {
        index += 1
        value += `\n${lines[index]}`
      }
      return decode(value)
    }
  }
  return value
}

/** One-line JSON string, the form that survives a copy/paste unchanged. */
function encode(value) {
  return JSON.stringify(String(value))
}

/** Write one `refs:` entry, creating the block when it is missing. */
export function writeRef(ref, value, file = storePath()) {
  if (!file) throw new Error('credential store not found; set DSH_CREDENTIALS_FILE')
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const refsAt = lines.findIndex((line) => /^refs:\s*$/.test(line))
  const prefix = new RegExp(`^\\s+${ref}\\s*:`)
  const entry = `  ${ref}: ${encode(value)}`

  let next
  if (refsAt < 0) {
    next = [...lines, ...(lines[lines.length - 1] === '' ? [] : []), 'refs:', entry, ''].join('\n')
  } else {
    // Drop the old entry together with its continuation lines, then insert.
    const kept = []
    let end = lines.length
    let skipping = false
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (index > refsAt && /^\S/.test(line)) {
        end = index
        break
      }
      if (prefix.test(line)) {
        skipping = true
        continue
      }
      if (skipping) {
        if (isIndented(line)) continue
        skipping = false
      }
      kept.push(line)
    }
    const insertAt = refsAt + 1
    next = [...kept.slice(0, insertAt), entry, ...kept.slice(insertAt, end), ...lines.slice(end)].join('\n')
  }
  writeFileSync(file, next, { mode: statSync(file).mode })
  return file
}

/** Mask a secret so it can be printed without leaking it. */
export function mask(value) {
  const text = String(value || '')
  if (!text) return '(empty)'
  if (text.length <= 8) return `${text.slice(0, 2)}…(${text.length})`
  return `${text.slice(0, 4)}…${text.slice(-2)} (${text.length} chars)`
}