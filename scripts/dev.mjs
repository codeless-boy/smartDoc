// Wrapper around `electron-vite dev` that swaps better-sqlite3 to the Electron
// ABI before launch and restores the Node ABI on exit, so `npm run dev` works
// without manual `rebuild:electron` / `rebuild:node` bookkeeping.
//
// Why: Vitest uses host-Node ABI (v147); Electron 32 uses ABI v128. The same
// .node file can't serve both. `test:e2e` handles this with a chained `&&`
// script because playwright exits. `dev` is long-running (HMR), so we spawn it
// as a child and restore the Node ABI when it exits (Ctrl+C or window close).
import { spawn, spawnSync } from 'node:child_process'

function rebuild(target) {
  const r = spawnSync(
    process.execPath,
    ['scripts/rebuild-sqlite.mjs', target],
    { stdio: 'inherit' }
  )
  if (r.status !== 0) {
    console.error(`[dev] rebuild:${target} failed (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

// Swap to Electron ABI before launching.
rebuild('electron')

const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

// Restore Node ABI no matter how the dev server exits.
function restore() {
  try {
    rebuild('node')
  } finally {
    process.exit(0)
  }
}
child.on('exit', restore)
// Ctrl+C in the terminal: forward to child, then restore on its exit.
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
