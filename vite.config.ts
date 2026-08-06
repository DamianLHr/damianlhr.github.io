/// <reference types="vitest/config" />
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT = dirname(fileURLToPath(import.meta.url))

/**
 * Dev-only: POST a data-URL to /__shot and it lands in design/shots/.
 *
 * The GPU themes can only really be judged as pictures, and a headless review
 * loop has no way to look at a canvas. This lets the page hand its own rendered
 * frame back to disk. Never registered in a production build.
 */
function screenshotSink(): Plugin {
  return {
    name: 'screenshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('POST only')
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const { name = 'shot', dataUrl } = JSON.parse(body)
            const b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '')
            const ext = String(dataUrl).startsWith('data:image/png') ? 'png' : 'jpg'
            // anchored to the repo, not the server's cwd
            const dir = join(ROOT, 'design', 'shots')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `${String(name).replace(/[^\w.-]/g, '_')}.${ext}`)
            writeFileSync(file, Buffer.from(b64, 'base64'))
            res.end(file)
          } catch (e) {
            res.statusCode = 500
            res.end(String(e))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), screenshotSink()],
  test: {
    environment: 'node',
  },
})
