import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import cookieParser from 'cookie-parser'
import { HandCashConnect } from '@handcash/handcash-connect'

const app = express()
app.use(express.json())
app.use(cookieParser())

const PORT = Number(process.env.PORT || 8080)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// If behind a reverse proxy / ingress, this makes secure cookies work correctly.
// (Required if you set Secure cookies and terminate TLS at ingress)
app.set('trust proxy', 1)

/**
 * CORS:
 * - Must allow credentials so cookies are sent.
 * - Origin must be explicit (not '*') when credentials are true.
 */
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
)

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
 * DEV session store (in-memory):
 * sessionToken -> authToken
 * For prod: use Redis/DB + expiration.
 */
const sessionToAuthToken = new Map()

/**
 * OAuth CSRF protection:
 * state -> createdAtMs
 * For prod: Redis with TTL.
 */
const oauthStateToCreatedAt = new Map()
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function now() {
  return Date.now()
}

function cleanupOldStates() {
  const cutoff = now() - OAUTH_STATE_TTL_MS
  for (const [state, createdAt] of oauthStateToCreatedAt.entries()) {
    if (createdAt < cutoff) oauthStateToCreatedAt.delete(state)
  }
}

function createSession(authToken) {
  const sessionToken = crypto.randomBytes(32).toString('base64url')
  sessionToAuthToken.set(sessionToken, authToken)
  return sessionToken
}

function lookupAuthTokenFromSession(sessionToken) {
  return sessionToAuthToken.get(sessionToken)
}

function clearSession(sessionToken) {
  sessionToAuthToken.delete(sessionToken)
}

function cookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production'
  // If you're using HTTPS at ingress, req.secure will be true when trust proxy is set.
  const secure = isProd ? true : req.secure

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    // 7 days; adjust to taste
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}

app.get('/', (_req, res) => res.status(200).send('metabridge backend ok'))

/**
 * Start OAuth:
 * - generate state
 * - redirect to HandCash with requested permissions + state
 */
app.get('/auth/handcash/start', (req, res) => {
  cleanupOldStates()

  const state = crypto.randomBytes(24).toString('base64url')
  oauthStateToCreatedAt.set(state, now())

  // IMPORTANT: include required permissions
  // If you previously needed PAY, keep it here.
  const url = hc.getRedirectionUrl({
    permissions: ['PAY'],
    state,
  })

  res.redirect(url)
})

/**
 * OAuth callback:
 * - validate state
 * - create session
 * - set HttpOnly cookie
 * - redirect back to frontend (no session in URL)
 */
app.get('/auth/handcash/callback', (req, res) => {
  cleanupOldStates()

  const authToken = String(req.query.authToken || '')
  const state = String(req.query.state || '')

  if (!authToken) return res.status(400).send('Missing authToken')
  if (!state) return res.status(400).send('Missing state')

  const createdAt = oauthStateToCreatedAt.get(state)
  if (!createdAt || createdAt < now() - OAUTH_STATE_TTL_MS) {
    return res.status(400).send('Invalid/expired state')
  }

  // One-time use state
  oauthStateToCreatedAt.delete(state)

  const sessionToken = createSession(authToken)

  res.cookie('mb_session', sessionToken, cookieOptions(req))
  res.redirect(`${FRONTEND_URL}/`)
})

/**
 * Optional logout endpoint (clears cookie + server session)
 */
app.post('/auth/logout', (req, res) => {
  const sessionToken = String(req.cookies?.mb_session || '')
  if (sessionToken) clearSession(sessionToken)

  res.clearCookie('mb_session', { path: '/' })
  res.json({ ok: true })
})
app.get('/api/session', (req, res) => {
  const sessionToken = String(req.cookies?.mb_session || '').trim()
  if (!sessionToken) return res.json({ ok: false })
  const authToken = lookupAuthTokenFromSession(sessionToken)
  return res.json({ ok: !!authToken })
})
/**
 * Pay endpoint:
 * - reads session from cookie
 * - no Authorization header required
 */
app.post('/api/handcash/pay', async (req, res) => {
  try {
    const sessionToken = String(req.cookies?.mb_session || '').trim()
    if (!sessionToken) return res.status(401).json({ error: 'Not logged in (missing session cookie)' })

    const authToken = lookupAuthTokenFromSession(sessionToken)
    if (!authToken) return res.status(401).json({ error: 'Invalid/expired session' })

    const destination = String(req.body.destination || '').trim()
    const sendAmount = Number(req.body.sendAmount)
    const currencyCode = String(req.body.currencyCode || 'USD').trim()
    const raw = String(req.body.description || 'MetaBridge')
    const note = raw.slice(0, 25)

    if (!destination) return res.status(400).json({ error: 'destination is required (handle/paymail/address)' })
    if (!(sendAmount > 0)) return res.status(400).json({ error: 'sendAmount must be > 0' })

    const account = hc.getAccountFromAuthToken(authToken)

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
      details: e?.response?.data ?? e?.details ?? null,
    })
  }
})

app.listen(PORT, () => {
  console.log(`metabridge backend listening on http://localhost:${PORT}`)
  console.log(`FRONTEND_URL=${FRONTEND_URL}`)
})
