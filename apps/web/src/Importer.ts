import ScriptTemplate from '@bsv/sdk/script/ScriptTemplate'
import LockingScript from '@bsv/sdk/script/LockingScript'
import UnlockingScript from '@bsv/sdk/script/UnlockingScript'
import Signature from '@bsv/sdk/primitives/Signature'
import Transaction from '@bsv/sdk/transaction/Transaction'
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature'
import { sha256 } from '@bsv/sdk/primitives/Hash'
import { WalletInterface } from '@bsv/sdk/wallet/Wallet.interfaces'
import { toArray } from '@bsv/sdk/primitives/utils'

function verifyTruthy<T>(v: T | undefined): T {
  if (v == null) throw new Error('must have value')
  return v
}

type ProtocolID = [number, string]

export default class Importer implements ScriptTemplate {
  lock!: () => LockingScript | Promise<LockingScript>

  constructor(
    private protocolID: ProtocolID,
    private keyID: string,
    private counterparty: string = 'anyone'
  ) {}

  unlock(client: WalletInterface): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
    estimateLength: () => Promise<108>
  } {
    return {
      sign: async (tx: Transaction, inputIndex: number) => {
        let scope = TransactionSignature.SIGHASH_FORKID | TransactionSignature.SIGHASH_ALL

        const input = tx.inputs[inputIndex]
        const otherInputs = tx.inputs.filter((_, i) => i !== inputIndex)

        const sourceTXID = input.sourceTXID ?? input.sourceTransaction?.id('hex')
        if (!sourceTXID) throw new Error('input sourceTXID/sourceTransaction required')

        const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis
        if (sourceSatoshis == null) throw new Error('sourceSatoshis/sourceTransaction required')

        const lockingScript = input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript
        if (!lockingScript) throw new Error('lockingScript/sourceTransaction required')

        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: verifyTruthy(input.sourceOutputIndex),
          sourceSatoshis,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: verifyTruthy(input.sequence),
          subscript: lockingScript,
          lockTime: tx.lockTime,
          scope
        })

        const hashToSign = sha256(sha256(preimage))

        const { signature } = await client.createSignature({
          hashToDirectlySign: hashToSign,
          protocolID: this.protocolID,
          keyID: this.keyID,
          counterparty: this.counterparty
        })

        const raw = Signature.fromDER(signature)
        const sig = new TransactionSignature(raw.r, raw.s, scope)
        const sigForScript = sig.toChecksigFormat()

        const { publicKey } = await client.getPublicKey({
          protocolID: this.protocolID,
          keyID: this.keyID,
          counterparty: this.counterparty,
          forSelf: true
        })

        const pubkeyForScript = toArray(publicKey, 'hex')

        return new UnlockingScript([
          { op: sigForScript.length, data: sigForScript },
          { op: pubkeyForScript.length, data: pubkeyForScript }
        ])
      },

      estimateLength: async () => 108
    }
  }
}
