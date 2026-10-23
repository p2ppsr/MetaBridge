import type { Server } from 'node:http'

/** Complete accepted requests after the owning rollout withdraws the endpoint. */
export async function drainHttpServer(server: Server, graceMs = 100_000): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    let forced = false
    const idleSweep = setInterval(() => server.closeIdleConnections(), 25)
    const timeout = setTimeout(() => {
      forced = true
      server.closeAllConnections()
    }, graceMs)
    server.close(error => {
      clearTimeout(timeout)
      clearInterval(idleSweep)
      if (error !== undefined) reject(error)
      else resolve(forced)
    })
    server.closeIdleConnections()
  })
}
