import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { HandCashConnect } from '@handcash/handcash-connect'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT || 8080)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: FRONTEND_URL }))

const HANDCASH_APP_ID = process.env.HANDCASH_APP_ID
const HANDCASH_APP_SECRET = process.env.HANDCASH_APP_SECRET

if (!HANDCASH_APP_ID || !HANDCASH_APP_SECRET) {
  throw new Error('Missing HANDCASH_APP_ID / HANDCASH_APP_SECRET in .env')
}

const hc = new HandCashConnect({
  appId: HANDCASH_APP_ID,
  appSecret: HANDCASH_APP_SECRET,
})

/**
 * DEV session store:
 * sessionToken -> authToken
 * For prod: use Redis/DB + expiration.
 */
const sessionToAuthToken = new Map()

function createSession(authToken) {
  const sessionToken = crypto.randomBytes(24).toString('base64url')
  sessionToAuthToken.set(sessionToken, authToken)
  return sessionToken
}

function lookupAuthTokenFromSession(sessionToken) {
  return sessionToAuthToken.get(sessionToken)
}

app.get('/', (_req, res) => res.status(200).send('metabridge backend ok'))

app.get('/auth/handcash/start', (_req, res) => {
  const url = hc.getRedirectionUrl()
  res.redirect(url)
})


app.get('/auth/handcash/callback', (req, res) => {
  const authToken = String(req.query.authToken || '')
  if (!authToken) return res.status(400).send('Missing authToken')

  const sessionToken = createSession(authToken)
  res.redirect(`${FRONTEND_URL}/#sessionToken=${encodeURIComponent(sessionToken)}`)
})


app.post('/api/handcash/pay', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '')
    const sessionToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : ''

    if (!sessionToken) return res.status(401).json({ error: 'Missing Bearer sessionToken' })

    const authToken = lookupAuthTokenFromSession(sessionToken)
    if (!authToken) return res.status(401).json({ error: 'Invalid/expired sessionToken' })

    const destination = String(req.body.destination || '').trim()
    const sendAmount = Number(req.body.sendAmount)
    const currencyCode = String(req.body.currencyCode || 'USD').trim()
    const raw = String(req.body.description || 'MetaBridge')
    const note = raw.slice(0, 25)



    if (!destination) return res.status(400).json({ error: 'destination is required (handle/paymail/address)' })
    if (!(sendAmount > 0)) return res.status(400).json({ error: 'sendAmount must be > 0' })

    const account = hc.getAccountFromAuthToken(authToken)

    // REAL payment call
    const paymentResult = await account.wallet.pay({
  description: note, // <= 25 chars
  payments: [{ destination, currencyCode, sendAmount }],
})

    return res.json({ ok: true, paymentResult })
  } catch (e) {
  console.error('HandCash pay error:', e)
  return res.status(500).json({
    error: e?.message ?? String(e),
    name: e?.name,
    code: e?.code,
    details: e?.response?.data ?? e?.details ?? null
  })
}
})

app.listen(PORT, () => {
  console.log(`metabridge backend listening on http://localhost:${PORT}`)
  console.log(`FRONTEND_URL=${FRONTEND_URL}`)
})
