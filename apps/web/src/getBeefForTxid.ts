/* eslint-disable @typescript-eslint/no-unused-vars */
import { Beef } from '@bsv/sdk';
import { Services } from '@bsv/wallet-toolbox-client'

export default async function getBeefForTxid(txid: string, chain: 'main' | 'test'): Promise<Beef> {
  const so = Services.createDefaultOptions(chain)
  so.whatsOnChainApiKey = 'mainnet_f04a761108dc219136b903597c91c778'
  const s = new Services(so)
  return await s.getBeefForTxid(txid)
}