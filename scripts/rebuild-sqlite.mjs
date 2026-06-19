#!/usr/bin/env node
/**
 * Swap better-sqlite3's native binary between host-Node ABI and Electron ABI.
 *
 * better-sqlite3's prebuilt binary is ABI-specific. The same module folder
 * cannot serve both Vitest (host Node) and Playwright E2E (Electron 32) at
 * the same time. We keep two prebuilt tarballs cached at
 *   ~/AppData/Local/prebuild-install/
 * and copy whichever is needed into node_modules/better-sqlite3/build/Release/.
 *
 * Usage:
 *   node scripts/rebuild-sqlite.mjs node       # restore Node-ABI binary
 *   node scripts/rebuild-sqlite.mjs electron   # swap to Electron-32 ABI
 *
 * Why not prebuild-install? It silently fails (exits 0) when GitHub release
 * downloads time out under our network conditions. This script is direct:
 * extract a known cached tarball into the well-known target path.
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const PKG_VERSION = '12.11.1'
const TARGETS = {
  node: { runtime: 'node', abi: 'v147' },     // Host Node 26 (NODE_MODULE_VERSION 147)
  electron: { runtime: 'electron', abi: 'v128' } // Electron 32 (Node 22 → ABI 128)
}

const target = process.argv[2]
if (!TARGETS[target]) {
  console.error(`Usage: ${process.argv[1]} <node|electron>`)
  process.exit(1)
}

const { runtime, abi } = TARGETS[target]
const tarballName =
  `better-sqlite3-v${PKG_VERSION}-${runtime}-${abi}-win32-x64.tar.gz`
const cacheDir = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'prebuild-install'
)
const tarball = path.join(cacheDir, tarballName)

if (!fs.existsSync(tarball)) {
  console.error(`Missing cached prebuilt: ${tarball}`)
  console.error(
    `Download from https://github.com/WiseLibs/better-sqlite3/releases/download/v${PKG_VERSION}/${tarballName} and place it in the cache directory.`
  )
  process.exit(2)
}

const dest = path.join('node_modules', 'better-sqlite3')
// Ensure the destination dir exists (cleared by an earlier rebuild step)
fs.mkdirSync(dest, { recursive: true })
// tar -xzf into the better-sqlite3 module dir; the tarball contains build/Release/better_sqlite3.node
// Use --force-local because GNU tar on Git Bash treats `C:\...` as a remote spec.
// Use forward-slash paths so GNU tar doesn't choke on Windows backslashes either.
const toPosix = (p) => p.replace(/\\/g, '/')
execFileSync(
  'tar',
  ['--force-local', '-xzf', toPosix(tarball), '-C', toPosix(dest)],
  { stdio: 'inherit' }
)
console.log(`Swapped better-sqlite3 native binary to ${runtime} ABI (${abi}).`)
