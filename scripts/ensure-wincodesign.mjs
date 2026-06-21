// Ensures the electron-builder winCodeSign cache is populated.
//
// winCodeSign-2.6.0.7z contains darwin/* symlinks that 7za cannot create on
// Windows without Developer Mode / admin, causing electron-builder's own
// extraction to fail and retry forever. The darwin entries are irrelevant for
// Windows packaging, so we extract the archive ourselves (ignoring those 2
// symlink errors) into the canonical cache dir electron-builder looks for.
// On subsequent runs electron-builder sees the cache and skips downloading.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadFile } from './download.mjs'

const VERSION = '2.6.0'
const MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
const SEVENZIP = path.join('node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

export async function ensureWinCodeSign() {
  if (process.platform !== 'win32') return
  const cacheRoot = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'electron-builder',
    'Cache',
    'winCodeSign'
  )
  const target = path.join(cacheRoot, `winCodeSign-${VERSION}`)
  // Sentinel: electron-builder looks for signtool under windows-10/x64.
  const sentinel = path.join(target, 'windows-10', 'x64', 'signtool.exe')
  if (existsSync(sentinel)) return

  mkdirSync(cacheRoot, { recursive: true })
  const url = `${MIRROR}winCodeSign-${VERSION}/winCodeSign-${VERSION}.7z`
  const archive = path.join(cacheRoot, `winCodeSign-${VERSION}.7z`)
  if (!existsSync(archive)) {
    console.log(`[ensure-wincodesign] downloading ${url}`)
    await downloadFile(url, archive)
  }
  console.log(`[ensure-wincodesign] extracting to ${target}`)
  // -y auto-yes; the 2 darwin symlink errors are expected and harmless.
  const r = spawnSync(SEVENZIP, ['x', '-y', '-bd', archive, `-o${target}`], {
    stdio: 'inherit'
  })
  // 7za returns non-zero when any sub-item errors; the win32 files we need
  // are extracted regardless. Only fail if the sentinel is missing.
  if (!existsSync(sentinel)) {
    throw new Error(
      `[ensure-wincodesign] extraction did not produce ${sentinel} (exit ${r.status})`
    )
  }
  console.log('[ensure-wincodesign] cache ready')
}
