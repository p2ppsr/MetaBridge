import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, get } from 'node:http'
import { once } from 'node:events'
import { drainHttpServer } from './lifecycle.js'

test('drain completes an accepted HTTP response', async () => {
  let accepted!: () => void
  const requestAccepted = new Promise<void>(resolve => { accepted = resolve })
  const server = createServer((_req, res) => {
    accepted()
    setTimeout(() => res.end('completed'), 60)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const response = new Promise<string>((resolve, reject) => {
    get(`http://127.0.0.1:${address.port}`, res => {
      let body = ''
      res.on('data', data => { body += data })
      res.on('end', () => resolve(body))
      res.on('error', reject)
    }).on('error', reject)
  })
  await requestAccepted
  const drain = drainHttpServer(server, 1000)
  assert.equal(await response, 'completed')
  assert.equal(await drain, false)
})

test('drain bounds a stalled request', async () => {
  let accepted!: () => void
  const requestAccepted = new Promise<void>(resolve => { accepted = resolve })
  const server = createServer(() => { accepted() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const request = get(`http://127.0.0.1:${address.port}`)
  request.on('error', () => {})
  await requestAccepted
  const started = Date.now()
  assert.equal(await drainHttpServer(server, 50), true)
  assert.ok(Date.now() - started < 1000)
  request.destroy()
})
