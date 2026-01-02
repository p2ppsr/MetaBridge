import React, { useEffect, useMemo, useState } from 'react'
import WalletClient from '@bsv/sdk/wallet/WalletClient'
import PublicKey from '@bsv/sdk/primitives/PublicKey'
import P2PKH from '@bsv/sdk/script/templates/P2PKH'
import Transaction from '@bsv/sdk/transaction/Transaction'
import { Beef } from '@bsv/sdk/transaction/Beef'
import type { CreateActionInput, SignActionArgs } from '@bsv/sdk/wallet/Wallet.interfaces'

// Copy these from mountaintops (or your fixed versions)
import Importer from './Importer'
import getBeefForTxid from './getBeefForTxid'

const API_URL = 'http://localhost:8080'
const client = new WalletClient('auto')

type Network = 'mainnet' | 'testnet'
type Utxo = { txid: string; vout: number; satoshis: number }

function getSessionToken(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  const hashToken = new URLSearchParams(hash).get('sessionToken')
  if (hashToken) return hashToken
  return new URLSearchParams(window.location.search).get('sessionToken')
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

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0b1020 0%, #070914 100%)',
    color: '#e9ecff',
    fontFamily: `'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
    padding: 24
  } as React.CSSProperties,
  shell: {
    maxWidth: 980,
    margin: '0 auto'
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18
  } as React.CSSProperties,
  title: { fontSize: 28, margin: 0, letterSpacing: -0.2 } as React.CSSProperties,
  subtitle: { margin: 0, opacity: 0.8, fontSize: 14 } as React.CSSProperties,
  grid: {
    display: 'grid',
    gap: 14,
    gridTemplateColumns: '1fr'
  } as React.CSSProperties,
  row2: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 14
  } as React.CSSProperties,
  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: 16,
    boxShadow: '0 14px 40px rgba(0,0,0,0.35)'
  } as React.CSSProperties,
  cardTitle: { margin: 0, fontSize: 16, letterSpacing: -0.1 } as React.CSSProperties,
  cardDesc: { margin: '6px 0 0', fontSize: 13, opacity: 0.82, lineHeight: 1.35 } as React.CSSProperties,
  topActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end'
  } as React.CSSProperties,
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
  buttonDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed'
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
  field: {
    display: 'grid',
    gap: 6
  } as React.CSSProperties,
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
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 12,
    marginTop: 12
  } as React.CSSProperties,
  miniRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 } as React.CSSProperties,
  hint: { fontSize: 12, opacity: 0.75, marginTop: 8, lineHeight: 1.35 } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 10,
    fontSize: 13
  } as React.CSSProperties,
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

export default function App() {
  const [handcashSession, setHandcashSession] = useState<string | null>(() => localStorage.getItem('handcashSession'))
  const [metanetConnected, setMetanetConnected] = useState(false)

  const [network, setNetwork] = useState<Network>('mainnet')

  // Receive identity
  const [receiveKeyId, setReceiveKeyId] = useState(() => localStorage.getItem('receiveKeyId') ?? '')
  const [receivePubKey, setReceivePubKey] = useState(() => localStorage.getItem('receivePubKey') ?? '')
  const [receiveAddress, setReceiveAddress] = useState(() => localStorage.getItem('receiveAddress') ?? '')

  // Deposits
  const [utxos, setUtxos] = useState<Utxo[]>([])
  const [depositSats, setDepositSats] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  // HandCash payment
  const [hcDest, setHcDest] = useState(() => localStorage.getItem('hcDest') ?? '')
  const [hcUsdAmount, setHcUsdAmount] = useState<number>(0.01)

  // MetaNet send
  const [toAddress, setToAddress] = useState('')
  const [toSats, setToSats] = useState(1000)

  const [log, setLog] = useState('')

  useEffect(() => {
    const token = getSessionToken()
    if (token) {
      localStorage.setItem('handcashSession', token)
      setHandcashSession(token)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('receiveKeyId', receiveKeyId)
    localStorage.setItem('receivePubKey', receivePubKey)
    localStorage.setItem('receiveAddress', receiveAddress)
    localStorage.setItem('hcDest', hcDest)
  }, [receiveKeyId, receivePubKey, receiveAddress, hcDest])

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
    window.location.href = `${API_URL}/auth/handcash/start`
  }

  async function generateReceiveAddress() {
    try {
      if (!metanetConnected) throw new Error('Connect MetaNet first.')
      setBusy('gen-receive')

      const { network } = await client.getNetwork({})
      setNetwork(network)

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

      setHcDest(addr)
      setLog(`Receive address generated.\nkeyID: ${keyID}\naddress: ${addr}`)
    } catch (e: any) {
      setLog(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function refreshDeposits() {
    try {
      if (!receiveAddress) throw new Error('Generate a receive address first.')
      setBusy('refresh')

      const wocNet = network === 'mainnet' ? 'main' : 'test'
      const r = await fetch(`https://api.whatsonchain.com/v1/bsv/${wocNet}/address/${receiveAddress}/unspent/all`)
      const j = await r.json()

      if (!r.ok) throw new Error(j?.error ?? `WhatsOnChain error (${r.status})`)

      const parsed: Utxo[] =
        (j.result ?? [])
          .filter((x: any) => x.isSpentInMempoolTx === false)
          .map((x: any) => ({ txid: x.tx_hash, vout: x.tx_pos, satoshis: x.value }))

      setUtxos(parsed)
      const total = parsed.reduce((a, b) => a + b.satoshis, 0)
      setDepositSats(total)

      setLog(parsed.length ? `Found ${parsed.length} deposit(s): ${formatSats(total)} sats.` : 'No deposits found yet.')
    } catch (e: any) {
      setLog(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function importDeposits() {
    let reference: string | undefined
    try {
      if (!metanetConnected) throw new Error('Connect MetaNet first.')
      if (!receiveKeyId) throw new Error('Missing receive keyID (generate receive address again).')
      if (!utxos.length) throw new Error('No deposits to import. Click “Refresh” first.')

      setBusy('import')

      const inputs: CreateActionInput[] = utxos.map(u => ({
        outpoint: `${u.txid}.${u.vout}`,
        inputDescription: 'Import deposit',
        unlockingScriptLength: 108
      }))

      // Build BEEF for the input source txs
      const inputBEEF = new Beef()
      for (const u of utxos) {
        if (!inputBEEF.findTxid(u.txid)) {
          const beef = await getBeefForTxid(u.txid, network === 'mainnet' ? 'main' : 'test')
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

      // ✅ IMPORTANT: use your metabridge derivation + receiveKeyId (NOT mountaintops hardcode)
      const importer = new Importer([1, 'metabridge'], receiveKeyId, 'anyone')
      const unlocker = importer.unlock(client)

      const signActionArgs: SignActionArgs = { reference, spends: {} }

      for (let i = 0; i < inputs.length; i++) {
        const script = await unlocker.sign(tx, i)
        signActionArgs.spends[i] = { unlockingScript: script.toHex() }
      }

      await client.signAction(signActionArgs)

      setLog(`Imported deposits: ${formatSats(depositSats)} sats.`)
      setUtxos([])
      setDepositSats(0)
    } catch (e: any) {
      if (reference) {
        try { await client.abortAction({ reference }) } catch {}
      }
      setLog(`Import failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handcashPayUsd() {
    try {
      if (!handcashSession) throw new Error('Connect HandCash first.')
      const dest = hcDest.trim()
      if (!dest) throw new Error('Enter a destination.')
      setBusy('handcash-pay')

      // keep under 25 chars
      const note = 'MetaBridge deposit'

      const r = await fetch(`${API_URL}/api/handcash/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${handcashSession}`
        },
        body: JSON.stringify({
          destination: dest,
          sendAmount: hcUsdAmount,
          currencyCode: 'USD',
          description: note
        })
      })

      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? JSON.stringify(j))

      setLog(`HandCash payment sent.\n${JSON.stringify(j, null, 2)}`)
    } catch (e: any) {
      setLog(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  async function metanetSendToAddress() {
    try {
      if (!metanetConnected) throw new Error('Connect MetaNet first.')
      const addr = toAddress.trim()
      if (!addr) throw new Error('Enter a destination address.')
      if (!looksLikeBase58Address(addr)) throw new Error('That doesn’t look like a valid base58 address.')
      if (!Number.isSafeInteger(toSats) || toSats <= 0) throw new Error('Satoshis must be a positive integer.')
      setBusy('metanet-send')

      const lockingScript = new P2PKH().lock(addr).toHex()
      const { txid } = await client.createAction({
        description: 'MetaBridge: send',
        outputs: [{ satoshis: toSats, lockingScript, outputDescription: 'Transfer' }]
      })

      setLog(`Sent ${formatSats(toSats)} sats.\nTXID: ${txid}`)
      setToAddress('')
      setToSats(1000)
    } catch (e: any) {
      setLog(e?.message ?? String(e))
    } finally {
      setBusy(null)
    }
  }

  const canImport = metanetConnected && !!receiveKeyId && utxos.length > 0 && busy == null

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>MetaBridge</h1>
            <p style={styles.subtitle}>Move value between HandCash and your MetaNet wallet — deposits included.</p>
          </div>

          <div style={styles.topActions}>
            <span style={styles.pill(metanetConnected)}>
              {metanetConnected ? 'MetaNet connected' : 'MetaNet not connected'}
            </span>
            <span style={styles.pill(!!handcashSession)}>
              {handcashSession ? 'HandCash connected' : 'HandCash not connected'}
            </span>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary, ...(busy ? styles.buttonDisabled : {}) }}
              onClick={connectMetanet}
              disabled={!!busy}
            >
              Connect MetaNet
            </button>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary }}
              onClick={connectHandcash}
            >
              Connect HandCash
            </button>
            {handcashSession && (
              <button
                style={{ ...styles.button, ...styles.buttonDanger }}
                onClick={() => {
                  localStorage.removeItem('handcashSession')
                  setHandcashSession(null)
                  setLog('HandCash session cleared locally.')
                }}
              >
                Logout
              </button>
            )}
          </div>
        </div>

        <div style={{ ...styles.row2, gridTemplateColumns: '1.15fr 0.85fr' }}>
          {/* Receive + Import */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Receive (HandCash → MetaNet)</h3>
            <p style={styles.cardDesc}>
              Generate a deposit address from your wallet. After you pay it, hit refresh and import to bring the funds into the wallet.
            </p>

            <div style={{ ...styles.twoCol, gridTemplateColumns: '1fr 1fr' }}>
              <div style={styles.field}>
                <div style={styles.label}>Receive keyID</div>
                <input style={{ ...styles.input, ...styles.mono }} readOnly value={receiveKeyId} placeholder="(none yet)" />
              </div>
              <div style={styles.field}>
                <div style={styles.label}>Network</div>
                <input style={{ ...styles.input, ...styles.mono }} readOnly value={network} />
              </div>
            </div>

            <div style={{ ...styles.field, marginTop: 12 }}>
              <div style={styles.label}>Deposit address</div>
              <input style={{ ...styles.input, ...styles.mono }} readOnly value={receiveAddress} placeholder="Generate to get an address…" />
            </div>

            <div style={styles.miniRow}>
              <button
                style={{ ...styles.button, ...styles.buttonPrimary, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={generateReceiveAddress}
                disabled={!!busy || !metanetConnected}
                title={!metanetConnected ? 'Connect MetaNet first' : ''}
              >
                {busy === 'gen-receive' ? 'Generating…' : 'Generate address'}
              </button>

              <button
                style={{ ...styles.button, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={() => {
                  if (!receiveAddress) return
                  navigator.clipboard.writeText(receiveAddress)
                  setLog('Deposit address copied.')
                }}
                disabled={!!busy || !receiveAddress}
              >
                Copy
              </button>

              <button
                style={{ ...styles.button, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={refreshDeposits}
                disabled={!!busy || !receiveAddress}
              >
                {busy === 'refresh' ? 'Refreshing…' : 'Refresh deposits'}
              </button>

              <button
                style={{
                  ...styles.button,
                  ...styles.buttonPrimary,
                  ...(canImport ? {} : styles.buttonDisabled)
                }}
                onClick={importDeposits}
                disabled={!canImport}
              >
                {busy === 'import' ? 'Importing…' : `Import (${formatSats(depositSats)} sats)`}
              </button>
            </div>

            <p style={styles.hint}>
              Quick note: deposits land on-chain at the address. “Import” is what pulls them into the wallet’s spendable set.
            </p>

            {utxos.length > 0 && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Outpoint</th>
                    <th style={styles.th}>Sats</th>
                  </tr>
                </thead>
                <tbody>
                  {utxos.slice(0, 8).map((u, idx) => (
                    <tr key={`${u.txid}.${u.vout}.${idx}`}>
                      <td style={{ ...styles.td, ...styles.mono }}>
                        {shortTxid(u.txid)}.{u.vout}
                      </td>
                      <td style={styles.td}>{formatSats(u.satoshis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* HandCash pay */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Send from HandCash</h3>
            <p style={styles.cardDesc}>
              Send a small payment to the deposit address (or any handle/paymail/address). Keep the note short.
            </p>

            <div style={styles.field}>
              <div style={styles.label}>Destination</div>
              <input
                style={{ ...styles.input, ...styles.mono }}
                value={hcDest}
                onChange={e => setHcDest(e.target.value)}
                placeholder="address / $handle / paymail"
              />
            </div>

            <div style={{ ...styles.field, marginTop: 12 }}>
              <div style={styles.label}>Amount (USD)</div>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={hcUsdAmount}
                onChange={e => setHcUsdAmount(Number(e.target.value))}
              />
            </div>

            <div style={styles.miniRow}>
              <button
                style={{
                  ...styles.button,
                  ...styles.buttonPrimary,
                  ...((!handcashSession || busy) ? styles.buttonDisabled : {})
                }}
                onClick={handcashPayUsd}
                disabled={!handcashSession || !!busy}
              >
                {busy === 'handcash-pay' ? 'Sending…' : 'Send'}
              </button>

              <button
                style={{ ...styles.button, ...((!receiveAddress || busy) ? styles.buttonDisabled : {}) }}
                onClick={() => {
                  if (!receiveAddress) return
                  setHcDest(receiveAddress)
                  setLog('Destination set to your deposit address.')
                }}
                disabled={!receiveAddress || !!busy}
              >
                Use my deposit address
              </button>
            </div>

            <p style={styles.hint}>
              If you don’t see it after sending: refresh deposits, then import.
            </p>
          </div>
        </div>

        {/* MetaNet send */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Send from MetaNet</h3>
          <p style={styles.cardDesc}>Send satoshis from your MetaNet wallet to any standard BSV address.</p>

          <div style={{ ...styles.twoCol, gridTemplateColumns: '1.4fr 0.6fr' }}>
            <div style={styles.field}>
              <div style={styles.label}>Destination address</div>
              <input
                style={{ ...styles.input, ...styles.mono }}
                value={toAddress}
                onChange={e => setToAddress(e.target.value)}
                placeholder="base58 address"
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
          </div>

          <div style={styles.miniRow}>
            <button
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                ...((!metanetConnected || busy) ? styles.buttonDisabled : {})
              }}
              onClick={metanetSendToAddress}
              disabled={!metanetConnected || !!busy}
            >
              {busy === 'metanet-send' ? 'Sending…' : 'Send sats'}
            </button>
          </div>
        </div>

        {/* Log */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Activity</h3>
          <p style={styles.cardDesc}>Last action / error output.</p>
          <div style={{ ...styles.logBox, ...styles.mono }}>{log || '(nothing yet)'}</div>
        </div>

        <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
          Tip: For dev, keep the same receive keyID/address while testing so imports always sign with the right key.
        </div>
      </div>

      {/* Responsive tweak */}
      <style>{`
        @media (max-width: 860px) {
          .two { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
