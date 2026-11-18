/**
 * Runs the test suite on any Node 20+ and any shell.
 *
 * `node --test test/` means "walk this directory" on some versions and "load
 * this path as a file" on others, and a quoted `test/*.test.js` is not a glob
 * to the runner at all. So the file list is resolved here and handed over as
 * plain arguments, which every version accepts the same way.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const testDir = path.join(here, '..', 'test')
const files = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(testDir, name))

if (files.length === 0) {
  console.error('no test files found in ' + testDir)
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(result.status === null ? 1 : result.status)
