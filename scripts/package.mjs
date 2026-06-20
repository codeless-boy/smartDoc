// Thin wrapper around electron-builder that injects China-friendly mirrors and
// pre-checks the winCodeSign cache, so `npm run package` / `npm run publish`
// work without manual env setup on this host.
//
// Background: electron-builder downloads electron + winCodeSign + nsis from
// GitHub on first run, which times out under our network. The npmmirror hosts
// are reachable. winCodeSign's archive contains darwin symlinks that 7za can't
// create without Windows Developer Mode; we pre-extract it once (see
// scripts/ensure-wincodesign.mjs) so electron-builder finds the cache populated
// and skips its own failing extraction.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ensureWinCodeSign } from './ensure-wincodesign.mjs'

const env = {
  ...process.env,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    'https://npmmirror.com/mirrors/electron-builder-binaries/'
}

// Make sure winCodeSign cache is populated (skip its broken symlink extraction).
await ensureWinCodeSign()

const args = process.argv.slice(2)
const result = spawnSync('electron-builder', args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})
process.exit(result.status ?? 1)
