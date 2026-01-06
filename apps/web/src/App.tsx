import React, { useEffect, useState } from 'react'
import WalletClient from '@bsv/sdk/wallet/WalletClient'
import PublicKey from '@bsv/sdk/primitives/PublicKey'
import P2PKH from '@bsv/sdk/script/templates/P2PKH'
import Transaction from '@bsv/sdk/transaction/Transaction'
import { Beef } from '@bsv/sdk/transaction/Beef'
import type { CreateActionInput, SignActionArgs } from '@bsv/sdk/wallet/Wallet.interfaces'

import Importer from './Importer'
import getBeefForTxid from './getBeefForTxid'

/**
 * IMPORTANT:
 * - Because we’re using HttpOnly cookies for HandCash sessions,
 *   ALL API calls must be same-origin + credentials: 'include'
 *
 * So we intentionally do NOT use http://localhost:8080 here.
 */
const API_URL = '' // same-origin
const client = new WalletClient('auto')

type Network = 'mainnet' | 'testnet'
type Utxo = { txid: string; vout: number; satoshis: number }

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatSats(n: number) {
  return n.toLocaleString('en-US')
}

function shortTxid(txid: string) {
  if (!txid) return ''
  return `${txid.slice(0, 10)}…${txid.slice(-8)}`
}

function looksLikeBase58Address(s: string) {
  const t = s.trim()
  if (t.length < 26 || t.length > 60) return false
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(t)
}

function outpointKey(u: Utxo) {
  return `${u.txid}.${u.vout}`
}

async function fetchUtxosForAddress(address: string, network: Network): Promise<Utxo[]> {
  const wocNet = network === 'mainnet' ? 'main' : 'test'
  const r = await fetch(`https://api.whatsonchain.com/v1/bsv/${wocNet}/address/${address}/unspent/all`)
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? `WhatsOnChain error (${r.status})`)

  return (j.result ?? [])
    .filter((x: any) => x.isSpentInMempoolTx === false)
    .map((x: any) => ({ txid: x.tx_hash, vout: x.tx_pos, satoshis: x.value }))
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0b1020 0%, #070914 100%)',
    color: '#e9ecff',
    fontFamily: `'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
    padding: 24
  } as React.CSSProperties,
  shell: { maxWidth: 980, margin: '0 auto' } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18
  } as React.CSSProperties,
  title: { fontSize: 28, margin: 0, letterSpacing: -0.2 } as React.CSSProperties,
  subtitle: { margin: 0, opacity: 0.8, fontSize: 14 } as React.CSSProperties,

  topActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end'
  } as React.CSSProperties,
  pill: (ok: boolean) =>
    ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      border: `1px solid ${ok ? 'rgba(130,255,190,0.30)' : 'rgba(255,255,255,0.14)'}`,
      background: ok ? 'rgba(130,255,190,0.10)' : 'rgba(255,255,255,0.06)',
      color: ok ? '#bfffe0' : '#d5daff'
    } as React.CSSProperties),

  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,

  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: 16,
    boxShadow: '0 14px 40px rgba(0,0,0,0.35)'
  } as React.CSSProperties,
  cardTitle: { margin: 0, fontSize: 16, letterSpacing: -0.1 } as React.CSSProperties,
  cardDesc: { margin: '6px 0 0', fontSize: 13, opacity: 0.82, lineHeight: 1.35 } as React.CSSProperties,

  button: {
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.08)',
    color: '#e9ecff',
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 600
  } as React.CSSProperties,
  buttonPrimary: {
    border: '1px solid rgba(120,150,255,0.45)',
    background: 'linear-gradient(180deg, rgba(120,150,255,0.35) 0%, rgba(120,150,255,0.18) 100%)'
  } as React.CSSProperties,
  buttonDanger: {
    border: '1px solid rgba(255,110,110,0.35)',
    background: 'rgba(255,110,110,0.10)'
  } as React.CSSProperties,
  buttonDisabled: { opacity: 0.55, cursor: 'not-allowed' } as React.CSSProperties,

  field: { display: 'grid', gap: 6, marginTop: 12 } as React.CSSProperties,
  label: { fontSize: 12, opacity: 0.85 } as React.CSSProperties,
  input: {
    width: '100%',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.28)',
    color: '#e9ecff',
    padding: '10px 12px',
    outline: 'none'
  } as React.CSSProperties,
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' } as React.CSSProperties,

  miniRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 } as React.CSSProperties,
  hint: { fontSize: 12, opacity: 0.75, marginTop: 10, lineHeight: 1.35 } as React.CSSProperties,

  table: { width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 } as React.CSSProperties,
  th: {
    textAlign: 'left',
    fontSize: 12,
    opacity: 0.8,
    padding: '8px 6px',
    borderBottom: '1px solid rgba(255,255,255,0.10)'
  } as React.CSSProperties,
  td: {
    padding: '10px 6px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    verticalAlign: 'top'
  } as React.CSSProperties,

  logBox: {
    marginTop: 14,
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: 12,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.35,
    fontSize: 13
  } as React.CSSProperties
}

async function apiGetSession(): Promise<boolean> {
  const r = await fetch(`${API_URL}/api/session`, { credentials: 'include' })
  if (!r.ok) return false
  const j = await r.json().catch(() => ({}))
  return !!j?.ok
}

export default function App() {
  // connections
  const [handcashConnected, setHandcashConnected] = useState(false)
  const [metanetConnected, setMetanetConnected] = useState(false)
  const [network, setNetwork] = useState<Network>('mainnet')

  // Receive identity (for HC -> MetaNet deposits)
  const [receiveKeyId, setReceiveKeyId] = useState(() => localStorage.getItem('receiveKeyId') ?? '')
  const [receivePubKey, setReceivePubKey] = useState(() => localStorage.getItem('receivePubKey') ?? '')
  const [receiveAddress, setReceiveAddress] = useState(() => localStorage.getItem('receiveAddress') ?? '')

  // Deposit scan state
  const [utxos, setUtxos] = useState<Utxo[]>([])
  const [depositSats, setDepositSats] = useState(0)

  // Metanet -> address (HandCash deposit address)
  const [toAddress, setToAddress] = useState(() => localStorage.getItem('toAddress') ?? '')
  const [toSats, setToSats] = useState(1000)

  // HandCash -> MetaNet amount
  const [hcUsdAmount, setHcUsdAmount] = useState<number>(0.01)

  const [busy, setBusy] = useState<string | null>(null)
  const [flowStatus, setFlowStatus] = useState('')
  const [log, setLog] = useState('')

  useEffect(() => {
    // On load, ask backend if cookie session exists.
    apiGetSession()
      .then(ok => setHandcashConnected(ok))
      .catch(() => setHandcashConnected(false))
  }, [])

  useEffect(() => {
    localStorage.setItem('receiveKeyId', receiveKeyId)
    localStorage.setItem('receivePubKey', receivePubKey)
    localStorage.setItem('receiveAddress', receiveAddress)
    localStorage.setItem('toAddress', toAddress)
  }, [receiveKeyId, receivePubKey, receiveAddress, toAddress])

  async function connectMetanet() {
    try {
      setBusy('connect-metanet')
      await client.connectToSubstrate()
      setMetanetConnected(true)
      const { network } = await client.getNetwork({})
      setNetwork(network)
      setLog(`MetaNet connected (${network}).`)
    } catch (e: any) {
      setLog(`MetaNet connect failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  function connectHandcash() {
    // Same-origin so cookies work.
    window.location.href = `/auth/handcash/start`
  }

  async function logoutHandcash() {
    try {
      setBusy('logout')
      const r = await fetch(`/auth/logout`, { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`logout failed (${r.status})`)
      setHandcashConnected(false)
      setLog('HandCash logged out.')
    } catch (e: any) {
      setLog(`Logout failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function generateReceiveAddressIfNeeded(): Promise<{ keyID: string; addr: string; network: Network }> {
    const { network } = await client.getNetwork({})
    setNetwork(network)

    if (receiveKeyId && receiveAddress) {
      return { keyID: receiveKeyId, addr: receiveAddress, network }
    }

    const keyID = `receive_${Date.now()}`
    const { publicKey } = await client.getPublicKey({
      protocolID: [1, 'metabridge'],
      keyID,
      counterparty: 'anyone',
      forSelf: true
    })
    const addr = PublicKey.fromString(publicKey).toAddress(network)

    setReceiveKeyId(keyID)
    setReceivePubKey(publicKey)
    setReceiveAddress(addr)

    return { keyID, addr, network }
  }

  async function importUtxos(keyID: string, spendUtxos: Utxo[], net: Network) {
    let reference: string | undefined
    try {
      const inputs: CreateActionInput[] = spendUtxos.map(u => ({
        outpoint: `${u.txid}.${u.vout}`,
        inputDescription: 'Import deposit',
        unlockingScriptLength: 108
      }))

      const inputBEEF = new Beef()
      for (const u of spendUtxos) {
        if (!inputBEEF.findTxid(u.txid)) {
          const beef = await getBeefForTxid(u.txid, net === 'mainnet' ? 'main' : 'test')
          inputBEEF.mergeBeef(beef)
        }
      }

      const { signableTransaction } = await client.createAction({
        inputBEEF: inputBEEF.toBinary(),
        inputs,
        description: 'MetaBridge: Import deposit'
      })

      if (!signableTransaction) throw new Error('No signableTransaction returned.')
      reference = signableTransaction.reference

      const tx = Transaction.fromAtomicBEEF(signableTransaction.tx)

      const importer = new Importer([1, 'metabridge'], keyID, 'anyone')
      const unlocker = importer.unlock(client)

      const signActionArgs: SignActionArgs = { reference, spends: {} }
      for (let i = 0; i < inputs.length; i++) {
        const script = await unlocker.sign(tx, i)
        signActionArgs.spends[i] = { unlockingScript: script.toHex() }
      }

      await client.signAction(signActionArgs)
    } catch (e) {
      if (reference) {
        try {
          await client.abortAction({ reference })
        } catch {}
      }
      throw e
    }
  }

  async function oneClickHandCashToMetaNet() {
    try {
      if (!handcashConnected) throw new Error('Connect HandCash first.')
      if (!metanetConnected) throw new Error('Connect MetaNet first.')

      setBusy('hc->mn')
      setFlowStatus('Preparing…')
      setLog('')

      const { keyID, addr, network } = await generateReceiveAddressIfNeeded()

      setFlowStatus('Snapshotting current deposits…')
      const before = await fetchUtxosForAddress(addr, network)
      const beforeSet = new Set(before.map(outpointKey))

      setFlowStatus('Sending from HandCash…')
      const note = 'MetaBridge deposit' // <= 25 chars

      // ✅ COOKIE SESSION FIX: same-origin + credentials include + NO Authorization header
      const r = await fetch(`${API_URL}/api/handcash/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          destination: addr,
          sendAmount: hcUsdAmount,
          currencyCode: 'USD',
          description: note
        })
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? JSON.stringify(j))

      setFlowStatus('Waiting for deposit to appear…')
      const maxTries = 40
      const intervalMs = 2500
      let newUtxos: Utxo[] = []
      for (let i = 0; i < maxTries; i++) {
        const after = await fetchUtxosForAddress(addr, network)
        newUtxos = after.filter(u => !beforeSet.has(outpointKey(u)))
        if (newUtxos.length > 0) break
        await sleep(intervalMs)
      }
      if (newUtxos.length === 0) throw new Error('Deposit not detected yet. Try again in a moment.')

      const totalNew = newUtxos.reduce((a, b) => a + b.satoshis, 0)
      setUtxos(newUtxos)
      setDepositSats(totalNew)

      setFlowStatus(`Importing ${newUtxos.length} deposit(s)…`)
      await importUtxos(keyID, newUtxos, network)

      setFlowStatus('Done ✅')
      setLog(
        `✅ HandCash → MetaNet complete\n` +
          `Deposit address: ${addr}\n` +
          `Imported: ${formatSats(totalNew)} sats\n` +
          `Outpoints: ${newUtxos.map(outpointKey).join(', ')}`
      )

      setUtxos([])
      setDepositSats(0)
    } catch (e: any) {
      setFlowStatus('')
      setLog(`❌ ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function metanetToHandcashAddress() {
    try {
      if (!metanetConnected) throw new Error('Connect MetaNet first.')
      const addr = toAddress.trim()
      if (!addr) throw new Error('Enter your HandCash deposit address.')
      if (!looksLikeBase58Address(addr)) throw new Error('That doesn’t look like a valid base58 address.')
      if (!Number.isSafeInteger(toSats) || toSats <= 0) throw new Error('Satoshis must be a positive integer.')
      setBusy('mn->hc')
      setLog('')

      const lockingScript = new P2PKH().lock(addr).toHex()
      const { txid } = await client.createAction({
        description: 'MetaBridge: MetaNet → HandCash',
        outputs: [{ satoshis: toSats, lockingScript, outputDescription: 'To HandCash deposit address' }],
          options: {
          randomizeOutputs: false,
          acceptDelayedBroadcast: false
        },
      })

      setLog(`✅ MetaNet → HandCash sent\nSats: ${formatSats(toSats)}\nTXID: ${txid}`)
      setToSats(1000)
    } catch (e: any) {
      setLog(`❌ ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const canOneClick = metanetConnected && handcashConnected && busy == null
  const canMetaSend = metanetConnected && busy == null

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>MetaBridge</h1>
            <p style={styles.subtitle}>Two buttons. Two directions. No extra steps.</p>
          </div>

          <div style={styles.topActions}>
            <span style={styles.pill(metanetConnected)}>{metanetConnected ? 'MetaNet connected' : 'MetaNet not connected'}</span>
            <span style={styles.pill(handcashConnected)}>{handcashConnected ? 'HandCash connected' : 'HandCash not connected'}</span>

            <button
              style={{ ...styles.button, ...styles.buttonPrimary, ...(busy ? styles.buttonDisabled : {}) }}
              onClick={connectMetanet}
              disabled={!!busy}
            >
              Connect MetaNet
            </button>

            <button
              style={{ ...styles.button, ...styles.buttonPrimary, ...(busy ? styles.buttonDisabled : {}) }}
              onClick={connectHandcash}
              disabled={!!busy}
            >
              Connect HandCash
            </button>

            {handcashConnected && (
              <button
                style={{ ...styles.button, ...styles.buttonDanger, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={logoutHandcash}
                disabled={!!busy}
              >
                Logout
              </button>
            )}
          </div>
        </div>

        <div style={styles.row2}>
          {/* HandCash -> MetaNet */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>HandCash → MetaNet</h3>

            <div style={styles.field}>
              <div style={styles.hint}>
                keyID: <span style={styles.mono}>{receiveKeyId || '(none yet)'}</span> • network:{' '}
                <span style={styles.mono}>{network}</span>
              </div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Amount (USD)</div>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={hcUsdAmount}
                onChange={e => setHcUsdAmount(Number(e.target.value))}
                disabled={!!busy}
              />
            </div>

            <div style={styles.miniRow}>
              <button
                style={{ ...styles.button, ...styles.buttonPrimary, ...(canOneClick ? {} : styles.buttonDisabled) }}
                onClick={oneClickHandCashToMetaNet}
                disabled={!canOneClick}
              >
                {busy === 'hc->mn' ? 'Depositing…' : `Deposit $${hcUsdAmount} → MetaNet`}
              </button>

              <button
                style={{ ...styles.button, ...(receiveAddress && !busy ? {} : styles.buttonDisabled) }}
                onClick={() => {
                  if (!receiveAddress) return
                  navigator.clipboard.writeText(receiveAddress)
                  setLog('Deposit address copied.')
                }}
                disabled={!receiveAddress || !!busy}
              >
                Copy address
              </button>
            </div>

            {busy === 'hc->mn' && flowStatus && <div style={styles.hint}>{flowStatus}</div>}

            {utxos.length > 0 && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Outpoint</th>
                    <th style={styles.th}>Sats</th>
                  </tr>
                </thead>
                <tbody>
                  {utxos.slice(0, 6).map((u, idx) => (
                    <tr key={`${u.txid}.${u.vout}.${idx}`}>
                      <td style={{ ...styles.td, ...styles.mono }}>
                        {shortTxid(u.txid)}.{u.vout}
                      </td>
                      <td style={styles.td}>{formatSats(u.satoshis)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...styles.td, opacity: 0.8 }}>Total</td>
                    <td style={styles.td}>{formatSats(depositSats)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* MetaNet -> HandCash */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>MetaNet → HandCash</h3>
            <p style={styles.cardDesc}>
              Paste your HandCash <b>deposit address</b> (from the HandCash app), then send satoshis from MetaNet.
            </p>

            <div style={styles.field}>
              <div style={styles.label}>HandCash deposit address</div>
              <input
                style={{ ...styles.input, ...styles.mono }}
                value={toAddress}
                onChange={e => setToAddress(e.target.value)}
                placeholder="base58 address (starts with 1...)"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Satoshis</div>
              <input
                style={styles.input}
                type="number"
                step="1"
                value={toSats}
                onChange={e => setToSats(Math.floor(Number(e.target.value)))}
              />
            </div>

            <div style={styles.miniRow}>
              <button
                style={{ ...styles.button, ...styles.buttonPrimary, ...(canMetaSend ? {} : styles.buttonDisabled) }}
                onClick={metanetToHandcashAddress}
                disabled={!canMetaSend}
              >
                {busy === 'mn->hc' ? 'Sending…' : `Send ${formatSats(toSats)} sats`}
              </button>
            </div>

            <div style={styles.hint}>Tip: start small. HandCash credits deposits on-chain; the app may update after a moment.</div>
          </div>
        </div>

        <div style={styles.logBox}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Activity</div>
          <div style={{ ...styles.mono }}>{log || '(nothing yet)'}</div>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .row2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}