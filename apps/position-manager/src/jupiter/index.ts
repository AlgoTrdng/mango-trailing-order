import { Jupiter, SwapMode } from '@jup-ag/core'
import { PublicKey } from '@solana/web3.js'
import JSBI from 'jsbi'

import { connection, walletKeyPair } from '../config'

export const initJupiter = async () => (
  Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: walletKeyPair,
  })
)

export type SwapParams = {
  inputMint: PublicKey
  outputMint: PublicKey
  amountRaw: number
  exactOut?: true
}

export type SwapResult = {
  txid: string
  inputAddress: PublicKey
  outputAddress: PublicKey
  inputAmount: number,
  outputAmount: number
}

export const executeJupiterSwap = async (jupiter: Jupiter, {
  inputMint,
  outputMint,
  amountRaw,
  exactOut,
}: SwapParams) => {
  const { routesInfos } = await jupiter.computeRoutes({
    inputMint,
    outputMint,
    amount: JSBI.BigInt(amountRaw),
    slippage: 0.1,
    swapMode: exactOut ? SwapMode.ExactOut : SwapMode.ExactIn,
  })
  const [bestRoute] = routesInfos

  const { execute } = await jupiter.exchange({ routeInfo: bestRoute })
  const swapResult = await execute()

  if ('txid' in swapResult) {
    return swapResult as SwapResult
  }

  return null
}
