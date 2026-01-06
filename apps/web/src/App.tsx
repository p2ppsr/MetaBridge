import React, { useCallback, useEffect, useMemo, useState } from 'react'
import WalletClient from '@bsv/sdk/wallet/WalletClient'
import PublicKey from '@bsv/sdk/primitives/PublicKey'
import P2PKH from '@bsv/sdk/script/templates/P2PKH'

import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { CurrencyConverter } from 'amountinator'
import { AmountDisplay } from 'amountinator-react'

import getBeefForTxid from './getBeefForTxid'

const API_URL = '' // keep empty when frontend+backend are on same domain
const client = new WalletClient('auto')

type Network = 'mainnet' | 'testnet'
type Utxo = { txid: string; vout: number; satoshis: number }

type RemittanceParams = {
  protocolID: [number, string]
  senderIdentityKey: string
  derivationPrefix: string
  derivationSuffix: string
}

const PENDING_REMIT_LS_KEY = 'pendingRemittance_v1'
const REMIT_ADDR_LS_KEY = 'remitAddress'
const TO_ADDR_LS_KEY = 'toAddress'
const MN_AMOUNT_LS_KEY = 'mn_amount_input_v1' // the preferred-currency string the user typed (e.g. "2.50")

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

function remitKeyId(r: RemittanceParams) {
  return `${r.derivationPrefix} ${r.derivationSuffix}`
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
    background: 'radial-gradient(1400px 800px at 50% -200px, rgba(120,150,255,0.22) 0%, rgba(10,12,22,0.0) 55%), linear-gradient(180deg, #0b1020 0%, #070914 100%)',
    color: '#e9ecff',
    fontFamily: `'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,
    padding: 'clamp(16px, 3vw, 24px)'
  } as React.CSSProperties,

  shell: { maxWidth: 980, margin: '0 auto' } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
    flexWrap: 'wrap'
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

  row2: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
    gap: 14,
    alignItems: 'start'
  } as React.CSSProperties,

  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    padding: 16,
    boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
    minWidth: 0
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
    fontWeight: 700,
    whiteSpace: 'nowrap'
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

  hint: { fontSize: 12, opacity: 0.78, marginTop: 10, lineHeight: 1.35 } as React.CSSProperties,

  notice: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 1.35,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(255, 208, 120, 0.28)',
    background: 'rgba(255, 208, 120, 0.08)',
    color: '#ffe8bf'
  } as React.CSSProperties,

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

/**
 * Amountinator-based input:
 * User types in THEIR preferred currency, we convert to satoshis for the action.
 */
function AmountinatorInputField({
  label,
  storageKey,
  onSatoshisChange
}: {
  label: string
  storageKey: string
  onSatoshisChange: (sats: number | null) => void
}) {
  const [amount, setAmount] = useState(() => localStorage.getItem(storageKey) ?? '')
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const currencyConverter = useMemo(() => new CurrencyConverter(), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await currencyConverter.initialize()
        if (cancelled) return
        setCurrencySymbol(currencyConverter.getCurrencySymbol())

        // hydrate sats on load (so Send works immediately after refresh)
        if (amount && amount !== '.' && amount !== '..') {
          const sats = await currencyConverter.convertToSatoshis(amount)
          if (!cancelled) onSatoshisChange(Number.isFinite(sats) ? Math.floor(sats) : null)
        }
      } catch {
        // keep UI usable even if converter fails
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAmountChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.target.value.replace(/[^0-9.]/g, '')
      setAmount(input)
      localStorage.setItem(storageKey, input)

      if (input === '' || input === '.' || input === '..') {
        onSatoshisChange(null)
        return
      }

      try {
        const satoshis = await currencyConverter.convertToSatoshis(input)
        onSatoshisChange(Number.isFinite(satoshis) ? Math.floor(satoshis) : null)
      } catch {
        onSatoshisChange(null)
      }
    },
    [currencyConverter, onSatoshisChange, storageKey]
  )

  return (
    <TextField
      label={label}
      variant="outlined"
      value={amount}
      onChange={handleAmountChange}
      fullWidth
      InputProps={{
        startAdornment:  <InputAdornment position="start" sx={{ color: 'rgba(233,236,255,0.85)' }}>
    <span style={{ color: 'inherit', fontWeight: 700 }}>{currencySymbol}</span>
  </InputAdornment>
      }}
      sx={{
        '& .MuiInputBase-root': {
          borderRadius: '10px',
          background: 'rgba(0,0,0,0.28)',
          color: '#e9ecff'
        },
        '& .MuiInputBase-input': {
          padding: '10px 12px'
        },
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: 'rgba(255,255,255,0.12)'
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: 'rgba(255,255,255,0.20)'
        },
        '& .MuiFormLabel-root': {
          color: 'rgba(233,236,255,0.65)'
        },
        '& .MuiFormLabel-root.Mui-focused': {
          color: 'rgba(233,236,255,0.85)'
        }
      }}
    />
  )
}

export default function App() {
  // connections
  const [handcashConnected, setHandcashConnected] = useState(false)
  const [metanetConnected, setMetanetConnected] = useState(false)
  const [network, setNetwork] = useState<Network>('mainnet')

  // Remittance state (persist to allow retry if app reloads)
  const [pendingRemit, setPendingRemit] = useState<RemittanceParams | null>(() => {
    try {
      const raw = localStorage.getItem(PENDING_REMIT_LS_KEY)
      return raw ? (JSON.parse(raw) as RemittanceParams) : null
    } catch {
      return null
    }
  })
  const [remitAddress, setRemitAddress] = useState(() => localStorage.getItem(REMIT_ADDR_LS_KEY) ?? '')

  // Deposit scan state
  const [utxos, setUtxos] = useState<Utxo[]>([])
  const [depositSats, setDepositSats] = useState(0)

  // MetaNet -> address (HandCash deposit address)
  const [toAddress, setToAddress] = useState(() => localStorage.getItem(TO_ADDR_LS_KEY) ?? '')
  const [toSats, setToSats] = useState<number | null>(null) // set by amountinator input

  // HandCash -> MetaNet amount (USD)
  const [hcUsdAmount, setHcUsdAmount] = useState<number>(2)

  const [busy, setBusy] = useState<string | null>(null)
  const [flowStatus, setFlowStatus] = useState('')
  const [log, setLog] = useState('')

  useEffect(() => {
    // On load, connect to MetaNet if possible, and check cookie session for HandCash.
    connectMetanet()
    apiGetSession()
      .then(ok => setHandcashConnected(ok))
      .catch(() => setHandcashConnected(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // local storage persistence for retry
    if (pendingRemit) localStorage.setItem(PENDING_REMIT_LS_KEY, JSON.stringify(pendingRemit))
    else localStorage.removeItem(PENDING_REMIT_LS_KEY)

    localStorage.setItem(REMIT_ADDR_LS_KEY, remitAddress)
    localStorage.setItem(TO_ADDR_LS_KEY, toAddress)
  }, [pendingRemit, remitAddress, toAddress])

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

  async function logoutHandcash() {
    try {
      setBusy('logout')
      const r = await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`logout failed (${r.status})`)
      setHandcashConnected(false)
      setLog('HandCash logged out.')
    } catch (e: any) {
      setLog(`Logout failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function prepareRemittanceDeposit(): Promise<{ remit: RemittanceParams; addr: string; network: Network }> {
    const { network } = await client.getNetwork({})
    setNetwork(network)

    const r = await fetch(`${API_URL}/api/remittance/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error ?? JSON.stringify(j))

    const remit: RemittanceParams = {
      protocolID: j.protocolID,
      senderIdentityKey: j.senderIdentityKey,
      derivationPrefix: j.derivationPrefix,
      derivationSuffix: j.derivationSuffix
    }

    const { publicKey } = await client.getPublicKey({
      protocolID: remit.protocolID,
      keyID: remitKeyId(remit),
      counterparty: remit.senderIdentityKey,
      forSelf: true
    })

    const addr = PublicKey.fromString(publicKey).toAddress(network)

    setPendingRemit(remit)
    setRemitAddress(addr)

    return { remit, addr, network }
  }

  async function internalizeRemittanceUtxos(remit: RemittanceParams, depositUtxos: Utxo[], net: Network) {
    const byTxid = new Map<string, Utxo[]>()
    for (const u of depositUtxos) {
      const arr = byTxid.get(u.txid) ?? []
      arr.push(u)
      byTxid.set(u.txid, arr)
    }

    for (const [txid, outs] of byTxid.entries()) {
      const beef = await getBeefForTxid(txid, net === 'mainnet' ? 'main' : 'test')

      const atomicBeef =
        typeof (beef as any).toBinaryAtomic === 'function' ? (beef as any).toBinaryAtomic(txid) : null

      if (!atomicBeef) {
        throw new Error('This build needs Beef.toBinaryAtomic(txid). Update @bsv/sdk / your BEEF helper.')
      }

      await client.internalizeAction({
        tx: atomicBeef,
        outputs: outs.map(o => ({
          outputIndex: o.vout,
          protocol: 'wallet payment',
          paymentRemittance: {
            senderIdentityKey: remit.senderIdentityKey,
            derivationPrefix: remit.derivationPrefix,
            derivationSuffix: remit.derivationSuffix
          }
        })),
        description: 'MetaBridge: HandCash remittance'
      })
    }
  }

  async function oneClickHandCashToMetaNet() {
    try {
      if (!handcashConnected) throw new Error('Connect HandCash first.')
      if (!metanetConnected) throw new Error('Connect MetaNet first.')

      setBusy('hc->mn')
      setFlowStatus('Preparing…')
      setLog('')

      setFlowStatus('Creating remittance destination…')
      const { remit, addr, network } = await prepareRemittanceDeposit()

      setFlowStatus('Snapshotting current deposits…')
      const before = await fetchUtxosForAddress(addr, network)
      const beforeSet = new Set(before.map(outpointKey))

      setFlowStatus('Sending from HandCash…')
      const note = 'MetaBridge deposit' // <= 25 chars

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

      setFlowStatus(`Internalizing ${newUtxos.length} deposit(s)…`)
      await internalizeRemittanceUtxos(remit, newUtxos, network)

      // success
      setPendingRemit(null)
      setRemitAddress('')

      setFlowStatus('Done ✅')
      setLog(
        `✅ HandCash → MetaNet (remittance) complete\n` +
          `Deposit address: ${addr}\n` +
          `Internalized: ${formatSats(totalNew)} sats\n` +
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

  async function retryInternalizePending() {
    try {
      if (!pendingRemit || !remitAddress) throw new Error('No pending remittance to retry.')
      if (!metanetConnected) throw new Error('Connect MetaNet first.')

      setBusy('retry')
      setFlowStatus('Re-scanning remittance address…')
      setLog('')

      const { network } = await client.getNetwork({})
      setNetwork(network)

      const found = await fetchUtxosForAddress(remitAddress, network)
      if (found.length === 0) throw new Error('No UTXOs found at remittance address yet.')

      const total = found.reduce((a, b) => a + b.satoshis, 0)
      setUtxos(found)
      setDepositSats(total)

      setFlowStatus(`Internalizing ${found.length} deposit(s)…`)
      await internalizeRemittanceUtxos(pendingRemit, found, network)

      setPendingRemit(null)
      setRemitAddress('')

      setFlowStatus('Done ✅')
      setLog(`✅ Retry internalize complete\nAddress: ${remitAddress}\nTotal: ${formatSats(total)} sats`)
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

      if (!toSats || !Number.isSafeInteger(toSats) || toSats <= 0) {
        throw new Error('Enter an amount (your preferred currency).')
      }

      setBusy('mn->hc')
      setLog('')

      const lockingScript = new P2PKH().lock(addr).toHex()
      const { txid } = await client.createAction({
        description: 'MetaBridge: MetaNet → HandCash',
        outputs: [{ satoshis: toSats, lockingScript, outputDescription: 'To HandCash deposit address' }],
        options: { randomizeOutputs: false, acceptDelayedBroadcast: false }
      })

      setLog(`✅ MetaNet → HandCash sent\nTXID: ${txid}`)
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
      <style>{`
        html, body, #root { height: 100%; margin: 0; background: #070914; }
        * { box-sizing: border-box; }
        body { overflow-x: hidden; }

        @media (max-width: 980px) {
          .row2 { grid-template-columns: 1fr !important; }
        }

        /* amountinator-react sometimes renders blocky nodes; force inline */
        .amtInline, .amtInline * { display: inline !important; white-space: nowrap !important; }
      `}</style>

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
            {hcUsdAmount > 10 && (
                <div style={styles.notice}>
                  Disclaimer: Transfering large amounts is not recommended! By reading this message you acknowledge that you are aware of the risks involved in transferring <b>${hcUsdAmount} </b>.
                </div>
              )}
        <div className="row2" style={styles.row2}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>HandCash → MetaNet</h3>

            <div style={styles.field}>
              <div style={styles.hint}>
                remit keyID: <span style={styles.mono}>{pendingRemit ? remitKeyId(pendingRemit) : '(none yet)'}</span> • network:{' '}
                <span style={styles.mono}>{network}</span>
              </div>
              {remitAddress && (
                <div style={styles.hint}>
                  deposit address: <span style={styles.mono}>{remitAddress}</span>
                </div>
              )}
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
                style={{ ...styles.button, ...(pendingRemit && remitAddress && !busy ? {} : styles.buttonDisabled) }}
                onClick={retryInternalizePending}
                disabled={!pendingRemit || !remitAddress || !!busy}
                title="If your app crashed after paying, you can safely retry internalizing."
              >
                Retry internalize
              </button>
            </div>

            {busy === 'hc->mn' && flowStatus && <div style={styles.hint}>{flowStatus}</div>}
            {busy === 'retry' && flowStatus && <div style={styles.hint}>{flowStatus}</div>}

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
              Paste your HandCash <b>deposit address</b> (from the HandCash app), then send using your MetaNet preferred currency.
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
              <AmountinatorInputField
                label="Amount (your MetaNet preferred currency)"
                storageKey={MN_AMOUNT_LS_KEY}
                onSatoshisChange={setToSats}
              />

              <div style={styles.hint}>
                Est:&nbsp;
                <span className="amtInline">
                  <AmountDisplay paymentAmount={toSats ?? 0} formatOptions={{ decimalPlaces: 2 }} />
                </span>
              </div>
            </div>

            <div style={styles.miniRow}>
              <button
                style={{ ...styles.button, ...styles.buttonPrimary, ...(canMetaSend ? {} : styles.buttonDisabled) }}
                onClick={metanetToHandcashAddress}
                disabled={!canMetaSend}
              >
                {busy === 'mn->hc' ? 'Sending…' : 'Send'}
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
    </div>
  )
}