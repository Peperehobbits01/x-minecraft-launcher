import { request } from 'undici'
import { LauncherAppPlugin } from '../app/LauncherApp'
import { kFlights } from '../entities/flights'
import { kClientToken } from '../entities/clientToken'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { read } from 'fs'
import { setTimeout } from 'timers/promises'

export const pluginFlights: LauncherAppPlugin = async (app) => {
  const logger = app.getLogger('Flights')
  const fetchFlights = async (output: Record<string, string>, cachedPath: string) => {
    try {
      const clientSession = await app.registry.get(kClientToken)
      const resp = await request(`https://api.xmcl.app/flights?version=${app.version}&locale=${app.host.getLocale()}&clientToken=${clientSession}`, {
      })
      if (resp.statusCode !== 200) {
        throw new Error()
      }
      const result = await resp.body.json()
      for (const [k, v] of Object.entries(result)) {
        if (typeof v === 'string') {
          output[k] = v
        }
      }
      // Write to cache
      await writeFile(cachedPath, JSON.stringify(output))
    } catch (e) {
      logger.error(e as Error)
    }
  }
  const readCachedFlights = async (output: Record<string, string>, cachedPath: string) => {
    try {
      const cached = JSON.parse(await readFile(cachedPath, 'utf-8'))
      for (const [k, v] of Object.entries(cached)) {
        if (typeof v === 'string') {
          output[k] = v
        }
      }
      return false
    } catch {
      return true
    }
  }
  const readFlights = async (output: Record<string, string>, cachedPath: string) => {
    if (await readCachedFlights(output, cachedPath)) {
      await Promise.race([fetchFlights(output, cachedPath), setTimeout(2000)])
    } else {
      fetchFlights(output, cachedPath).catch(() => { })
    }
  }
  try {
    const filtered = {} as Record<string, string>
    const cachedPath = join(app.appDataPath, 'flights.json')
    const promise = readFlights(filtered, cachedPath)

    app.protocol.registerHandler('http', async ({ request, response }) => {
      if (request.url.host === 'launcher' && request.url.pathname === '/flights') {
        await promise
        response.status = 200
        const jsContent = `window.flights = ${JSON.stringify(filtered)}`
        response.headers = {
          'content-type': 'application/javascript',
        }
        response.body = jsContent
      }
    })

    app.registry.register(kFlights, filtered)
  } catch {
    app.registry.register(kFlights, {})
  }
}