import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { nanoid } from 'nanoid'
import { getInstance, Connect } from '@handcash/sdk'

const app = express()
app.use(express.json())
app.use(cookieParser())

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
app.use(cors({ origin: FRONTEND_URL, credentials: true }))

const sdk = getInstance({
  appId: process.env.HANDCASH_APP_ID,
  appSecret: process.env.HANDCASH_APP_SECRET
})

// DEV ONLY: in-memory “sessionToken -> authToken” store.
// Replace with Redis/DB for production.
const sessions = new Map()

/**
 * 1) Start HandCash auth
 * - Redirects user to HandCash Connect auth page
 * - The redirect URL is configured in HandCash Dashboard.
 */
app.get('/auth/handcash/start', (req, res) => {
  const url = sdk.getRedirectionUrl()
  return res.redirect(url)
})

/**
 * 2) HandCash redirects back with ?authToken=...
 * - Exchange it for our own sessionToken
 * - Redirect user back to frontend with sessionToken
 *
 * This matches HandCash’s recommended flow (store authToken server-side). :contentReference[oaicite:2]{index=2}
 */
app.get('/auth/handcash/callback', (req, res) => {
  const authToken = req.query.authToken
  if (!authToken || typeof authToken !== 'string') {
    return res.status(400).send('Missing authToken')
  }

  const sessionToken = nanoid(32)
  sessions.set(sessionToken, { authToken, createdAt: Date.now() })

  const redirect = new URL(FRONTEND_URL)
  redirect.hash = `sessionToken=${encodeURIComponent(sessionToken)}`
  return res.redirect(redirect.toString())
})

function requireSession(req, res, next) {
  const header = req.headers.authorization || ''
  const sessionToken = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!sessionToken) return res.status(401).json({ error: 'Missing Bearer session token' })

  const s = sessions.get(sessionToken)
  if (!s) return res.status(401).json({ error: 'Invalid session token' })

  req.handcashAuthToken = s.authToken
  next()
}

/**
 * 3) Pay from HandCash wallet to a destination:
 * - destination can be handle, paymail, or base58 address (per docs/examples). :contentReference[oaicite:3]{index=3}
 */
app.post('/api/handcash/pay', requireSession, async (req, res) => {
  try {
    // IMPORTANT: sessionToken is your own; you must map it -> authToken server-side
    const authToken = await lookupAuthTokenFromSession(req.sessionToken) // implement this
    const client = sdk.getAccountClient(authToken)

    const { destination, amount, denominationCurrencyCode = 'USD', description = 'MetaBridge payout' } = req.body
    if (!destination) return res.status(400).json({ error: 'destination is required (handle/paymail/address)' })
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'amount must be > 0' })

    const { data, error } = await Connect.pay({
      client,
      body: {
        instrumentCurrencyCode: 'BSV',
        denominationCurrencyCode,
        description,
        receivers: [{ destination, sendAmount: amount }],
      },
    })

    if (error) return res.status(400).json({ error })
    return res.json({ data }) // <-- THIS should include real payment info (often tx/payment id)
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) })
  }
})

/**
 * Optional: create a HandCash payment request (receive BSV via HandCash Pay). :contentReference[oaicite:4]{index=4}
 */
app.post('/api/handcash/payment-request', async (req, res) => {
  try {
    const { amount, currency = 'USD', description, redirectUrl, cancelUrl } = req.body ?? {}
    if (typeof amount !== 'number' || !(amount > 0)) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }

    const pr = await sdk.createPaymentRequest({
      amount,
      currency,
      description,
      redirectUrl,
      cancelUrl
    })

    return res.json({ data: pr })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) })
  }
})

const port = Number(process.env.PORT ?? 8080)
app.listen(port, () =>{ console.log(`API listening on http://localhost:${port}`)
console.log('HANDCASH_APP_ID present:', !!process.env.HANDCASH_APP_ID)
console.log('HANDCASH_APP_SECRET present:', !!process.env.HANDCASH_APP_SECRET)
console.log('HANDCASH_APP_ID length:', (process.env.HANDCASH_APP_ID ?? '').length)
})
