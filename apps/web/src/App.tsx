import React, { useEffect, useMemo, useState } from 'react'
import { WalletClient, P2PKH, PublicKey } from '@bsv/sdk'

const API_URL = 'http://localhost:8080'

function getSessionToken(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  const hashParams = new URLSearchParams(hash)
  const hashToken = hashParams.get('sessionToken')
  if (hashToken) return hashToken

  const qsParams = new URLSearchParams(window.location.search)
  return qsParams.get('sessionToken')
}

// Basic base58 address sanity check (not perfect, but catches obvious mistakes)
function looksLikeBase58Address(s: string) {
  const t = s.trim()
  if (t.length < 26 || t.length > 60) return false
  // Base58 alphabet excludes 0 O I l
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(t)
}

function looksLikeHexPubKeyOrTxid(s: string) {
  const t = s.trim()
  // txid is 64 hex
  if (/^[0-9a-fA-F]{64}$/.test(t)) return true
  // compressed pubkey is 66 hex (02/03 + 64 hex)
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(t)) return true
  // uncompressed pubkey is 130 hex (04 + 128 hex)
  if (/^04[0-9a-fA-F]{128}$/.test(t)) return true
  return false
}

function looksLikePubKeyHex(s: string) {
  const t = s.trim()
  return (/^(02|03)[0-9a-fA-F]{64}$/.test(t)) || (/^04[0-9a-fA-F]{128}$/.test(t))
}

export default function App() {
  const [handcashSession, setHandcashSession] = useState<string | null>(() => localStorage.getItem('handcashSession'))
  const [metanetConnected, setMetanetConnected] = useState(false)
  const [log, setLog] = useState('')

  // MetaNet pubkey (since wallet may not show base58)
  const [metanetPubKey, setMetanetPubKey] = useState<string>(() => localStorage.getItem('metanetPubKey') ?? '')

  // HandCash send (destination + USD amount)
  const [hcUsdAmount, setHcUsdAmount] = useState(0.01)
  const [hcDest, setHcDest] = useState('')

  // MetaNet send (address + sats)
  const [toAddress, setToAddress] = useState('')
  const [toSats, setToSats] = useState(1000)

  const wallet = useMemo(() => new WalletClient('auto'), [])

  useEffect(() => {
    const token = getSessionToken()
    if (token) {
      localStorage.setItem('handcashSession', token)
      setHandcashSession(token)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('metanetPubKey', metanetPubKey)
  }, [metanetPubKey])

  // Derived receive address from pubkey (HandCash-compatible)
  const derivedMetanetAddress = useMemo(() => {
    try {
      const pk = metanetPubKey.trim()
      if (!pk) return ''
      if (!looksLikePubKeyHex(pk)) return ''

      // ✅ Correct ts-sdk API: fromString, not fromHex
      // PublicKey.fromString expects the pubkey hex string (compressed 02/03... or uncompressed 04...)
      return PublicKey.fromString(pk).toAddress('mainnet')
    } catch {
      return ''
    }
  }, [metanetPubKey])

  async function connectMetanet() {
    try {
      await wallet.connectToSubstrate()
      setMetanetConnected(true)

      // Try to automatically get a pubkey from the wallet (if your WalletClient supports it)
      // Many implementations expose: wallet.getPublicKey({ identityKey: true })
      // If it fails, user can still paste manually.
      try {
        const anyWallet = wallet as any
        if (typeof anyWallet.getPublicKey === 'function') {
          const res = await anyWallet.getPublicKey({ identityKey: true })
          const pk = res?.publicKey
          if (typeof pk === 'string' && looksLikePubKeyHex(pk)) {
            setMetanetPubKey(pk)
            setLog('✅ Connected to MetaNet wallet\n✅ Pulled pubkey from wallet automatically')
            return
          }
        }
        setLog('✅ Connected to MetaNet wallet\nℹ️ Paste your MetaNet pubkey below to derive a receive address')
      } catch {
        setLog('✅ Connected to MetaNet wallet\nℹ️ Paste your MetaNet pubkey below to derive a receive address')
      }
    } catch (e: any) {
      setLog(`❌ MetaNet connect failed: ${e?.message ?? String(e)}`)
    }
  }

  function connectHandcash() {
    window.location.href = `${API_URL}/auth/handcash/start`
  }

  function useDerivedAddressAsHandcashDestination() {
    if (!derivedMetanetAddress) {
      setLog('❌ Enter a valid MetaNet public key first (starts with 02 or 03).')
      return
    }
    setHcDest(derivedMetanetAddress)
    setLog('✅ HandCash destination set to your derived MetaNet receive address.')
  }

  async function handcashPayUsd() {
    try {
      if (!handcashSession) throw new Error('Not connected to HandCash')

      const dest = hcDest.trim().replace(/^\$/, '') // allow $handle
      if (!dest) throw new Error('Missing destination')

      // Stop the common mistake: user pastes pubkey/txid hex
      if (looksLikeHexPubKeyOrTxid(dest)) {
        throw new Error(
          'That looks like hex (pubkey/txid). HandCash needs a handle/paymail/base58 address. Use the derived address (1...) above.'
        )
      }

      if (!(hcUsdAmount > 0)) throw new Error('Amount must be > 0')

      const r = await fetch(`${API_URL}/api/handcash/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${handcashSession}`,
        },
        body: JSON.stringify({
          instrumentCurrencyCode: 'BSV',
          denominationCurrencyCode: 'USD',
          description: 'MetaBridge: HandCash → destination',
          receivers: [{ destination: dest, sendAmount: hcUsdAmount }],
        }),
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error?.message ?? JSON.stringify(j))
      setLog(`✅ HandCash pay success:\n${JSON.stringify(j, null, 2)}`)
    } catch (e: any) {
      setLog(`❌ ${e?.message ?? String(e)}`)
    }
  }

  async function metanetSendToAddress() {
    try {
      if (!metanetConnected) throw new Error('Connect MetaNet wallet first')
      const addr = toAddress.trim()
      if (!addr) throw new Error('Missing destination address')
      if (!looksLikeBase58Address(addr)) throw new Error('Destination does not look like a valid base58 address')
      if (!Number.isSafeInteger(toSats) || toSats <= 0) throw new Error('Satoshis must be a positive integer')

      const lockingScript = new P2PKH().lock(addr).toHex()

      const result = await wallet.createAction({
        description: 'MetaBridge: MetaNet → address',
        outputs: [
          {
            satoshis: toSats,
            lockingScript,
            outputDescription: 'Transfer to address',
          },
        ],
      })

      setLog(`✅ MetaNet createAction result:\n${JSON.stringify(result, null, 2)}`)
    } catch (e: any) {
      setLog(`❌ ${e?.message ?? String(e)}`)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, maxWidth: 920 }}>
      <h1>MetaBridge (MVP)</h1>

      <section style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={connectMetanet}>
          {metanetConnected ? '✅ MetaNet Connected' : 'Connect MetaNet Wallet'}
        </button>

        <button onClick={connectHandcash}>
          {handcashSession ? '✅ HandCash Connected' : 'Connect HandCash'}
        </button>

        {handcashSession && (
          <button
            onClick={() => {
              localStorage.removeItem('handcashSession')
              setHandcashSession(null)
              setLog('Logged out of HandCash session (local)')
            }}
          >
            HandCash Logout
          </button>
        )}
      </section>

      <hr />

      <h2>0) MetaNet Receive (PubKey → Address)</h2>
      <p style={{ maxWidth: 760 }}>
        Your MetaNet wallet shows a <b>public key</b> (hex). HandCash can’t send to a raw pubkey — it needs a destination like a{' '}
        <b>base58 address</b>. We derive a standard P2PKH address from your pubkey automatically.
      </p>

      <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
        <input
          placeholder="Paste your MetaNet pubkey hex (starts with 02 or 03...)"
          value={metanetPubKey}
          onChange={e => setMetanetPubKey(e.target.value)}
        />

        <input
          readOnly
          placeholder="Derived address (HandCash compatible) will appear here"
          value={derivedMetanetAddress}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (!derivedMetanetAddress) return setLog('❌ Invalid pubkey (expected compressed 02/03… hex).')
              navigator.clipboard.writeText(derivedMetanetAddress)
              setLog('✅ Copied derived address')
            }}
            disabled={!derivedMetanetAddress}
          >
            Copy address
          </button>

          <button onClick={useDerivedAddressAsHandcashDestination} disabled={!derivedMetanetAddress}>
            Use as HandCash destination
          </button>

          <button
            onClick={() => {
              setMetanetPubKey('')
              localStorage.removeItem('metanetPubKey')
              setLog('Cleared saved MetaNet pubkey')
            }}
          >
            Clear pubkey
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Tip: test with a tiny amount first to confirm your MetaNet wallet recognizes UTXOs paid to this derived address.
        </div>
      </div>

      <hr />

      <h2>1) HandCash ➜ MetaNet</h2>
      <p>Click “Use as HandCash destination” above, then send.</p>

      <div style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        <input
          placeholder="destination (handle/paymail/address)"
          value={hcDest}
          onChange={e => setHcDest(e.target.value)}
        />

        <input
          type="number"
          step="0.01"
          value={hcUsdAmount}
          onChange={e => setHcUsdAmount(Number(e.target.value))}
        />

        <button onClick={handcashPayUsd} disabled={!handcashSession}>
          Send from HandCash
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          If you paste a pubkey/txid hex here by accident, we’ll stop and explain why.
        </div>
      </div>

      <hr />

      <h2>2) MetaNet ➜ HandCash (or any address)</h2>
      <p>Send satoshis to a base58 address (e.g. your HandCash deposit address).</p>

      <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
        <input placeholder="base58 address" value={toAddress} onChange={e => setToAddress(e.target.value)} />
        <input type="number" step="1" value={toSats} onChange={e => setToSats(Math.floor(Number(e.target.value)))} />
        <button onClick={metanetSendToAddress} disabled={!metanetConnected}>
          Send from MetaNet wallet
        </button>
      </div>

      <hr />

      <h2>Log</h2>
      <pre style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
        {log || '(no output yet)'}
      </pre>
    </div>
  )
}
