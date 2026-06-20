// Small dependency-free file downloader (https GET, follows redirects).
// Used by the packaging helper scripts to fetch electron-builder toolchain
// artifacts from the npmmirror host, since prebuild-install / electron-builder's
// own downloaders silently fail or time out under our network.
import fs from 'node:fs'
import https from 'node:https'

export function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u) => {
      https
        .get(u, (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume()
            get(new URL(res.headers.location, u).toString())
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => file.close(resolve))
        })
        .on('error', reject)
    }
    get(url)
  })
}
