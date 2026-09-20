import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scenariosDir = join(__dirname, 'data', 'scenarios')

function ensureScenariosDir() {
  if (!existsSync(scenariosDir)) mkdirSync(scenariosDir, { recursive: true })
}

// A scenario's display name is stored inside the file; the filename is
// derived from it but slugified so arbitrary names can't escape the
// scenarios directory.
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw new Error('Scenario name must contain at least one letter or number')
  return slug
}

function scenarioPath(name: string): string {
  return join(scenariosDir, `${slugify(name)}.json`)
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// Dev-only API for listing, loading, saving, and deleting named retirement
// scenarios, each persisted as its own JSON file under data/scenarios/.
function localScenariosApi(): Plugin {
  return {
    name: 'local-scenarios-api',
    configureServer(server) {
      server.middlewares.use('/api/scenarios', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const rawName = url.pathname.split('/').filter(Boolean)[0]
        const name = rawName ? decodeURIComponent(rawName) : null

        try {
          if (req.method === 'GET' && !name) {
            ensureScenariosDir()
            const files = readdirSync(scenariosDir).filter((f) =>
              f.endsWith('.json'),
            )
            const scenarios = files.map((file) => {
              const parsed = JSON.parse(
                readFileSync(join(scenariosDir, file), 'utf-8'),
              )
              return { name: parsed.name, updatedAt: parsed.updatedAt }
            })
            scenarios.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(scenarios))
            return
          }

          if (req.method === 'GET' && name) {
            const path = scenarioPath(name)
            if (!existsSync(path)) {
              res.statusCode = 404
              res.end()
              return
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(readFileSync(path, 'utf-8'))
            return
          }

          if (req.method === 'PUT' && name) {
            const body = JSON.parse(await readBody(req))
            ensureScenariosDir()
            const record = {
              name,
              inputs: body,
              updatedAt: new Date().toISOString(),
            }
            writeFileSync(scenarioPath(name), JSON.stringify(record, null, 2))
            res.statusCode = 204
            res.end()
            return
          }

          if (req.method === 'DELETE' && name) {
            const path = scenarioPath(name)
            if (existsSync(path)) unlinkSync(path)
            res.statusCode = 204
            res.end()
            return
          }

          res.statusCode = 405
          res.end()
        } catch (err) {
          res.statusCode = 400
          res.end(err instanceof Error ? err.message : 'Bad request')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localScenariosApi()],
})
