import {
  MangoAccountLayout, MangoAccount, MangoGroup, MangoCache, MangoClient, PerpMarket,
} from '@blockworks-foundation/mango-client'
import { Jupiter, SwapResult } from '@jup-ag/core'
import { AccountInfo } from '@solana/web3.js'

import { connection } from './config'
import { USDC_MINT, SOL_MINT } from './constants'
import { executeJupiterSwap, SwapParams } from './jupiter'
import { GetOrderbookSide, placePerpTrailingOrder } from './mango'
import { toRaw, floor } from './utils/amount'
import { debounce } from './utils/debounce'
import { wait } from './utils/wait'

const createDebouncedSwap = (
  jupiter: Jupiter,
  {
    inputMint,
    outputMint,
    exactOut,
  }: Omit<SwapParams, 'amountRaw'>,
) => (
  debounce(async (amountRaw: number) => {
    let result: SwapResult | null = null
    do {
      result = await executeJupiterSwap(jupiter, {
        inputMint,
        outputMint,
        exactOut,
        amountRaw,
      })

      if (!result) {
        await wait(500)
      }
    } while (!result)
  }, 2000)
)

type DecodePositionSizeParams = {
  accountInfo: AccountInfo<Buffer>
  tokenIndex: number
  mangoAccount: MangoAccount
  mangoGroup: MangoGroup
}

const decodePositionSize = ({
  accountInfo,
  tokenIndex,
  mangoAccount,
  mangoGroup,
}: DecodePositionSizeParams) => {
  const decoded = MangoAccountLayout.decode(accountInfo.data)
  const account = new MangoAccount(mangoAccount.publicKey, decoded)
  return Math.abs(
    account.getBasePositionUiWithGroup(tokenIndex, mangoGroup),
  )
}

export type DeltaNeutralPositionParams = {
  jupiter: Jupiter
  mangoAccount: MangoAccount
  mangoGroup: MangoGroup
  mangoClient: MangoClient
  perpMarket: PerpMarket
  tokenIndex: number
  basePositionSizeUi: number
  getOrderbookSide: GetOrderbookSide
}

/**
 * Opens short delta neutral position
 *  - SOL-PERP Short
 *  - hedged with spot SOL/USDC
 */
export const openShortDeltaNeutralPosition = async ({
  jupiter,
  mangoAccount,
  mangoGroup,
  mangoClient,
  perpMarket,
  getOrderbookSide,
  tokenIndex,
  basePositionSizeUi,
}: DeltaNeutralPositionParams) => {
  // -------------------
  // Open hedge position
  let openedPositionSize = 0
  await (async () => {
    const debouncedBuy = createDebouncedSwap(jupiter, {
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      exactOut: true,
    })

    const subscriptionId = connection.onAccountChange(mangoAccount.publicKey, (accountInfo) => {
      const currentPositionSize = decodePositionSize({
        accountInfo,
        tokenIndex,
        mangoAccount,
        mangoGroup,
      })

      if (currentPositionSize === openedPositionSize) {
        return
      }

      const solAmountToBuy = currentPositionSize - openedPositionSize
      debouncedBuy(toRaw(solAmountToBuy, 9))

      openedPositionSize = currentPositionSize
      if (floor(openedPositionSize, 2) === basePositionSizeUi) {
        connection.removeAccountChangeListener(subscriptionId)
      }
    })

    await wait(1000)
  })()

  await placePerpTrailingOrder({
    positionSizeUi: basePositionSizeUi,
    orderSide: 'sell',
    orderbookSideGetter: getOrderbookSide,
    mangoClient,
    mangoGroup,
    mangoAccount,
    perpMarket,
  })

  return openedPositionSize
}

export const closeShortDeltaNeutralPosition = async ({
  getOrderbookSide,
  jupiter,
  basePositionSizeUi,
  mangoAccount,
  mangoGroup,
  mangoClient,
  tokenIndex,
  perpMarket,
}: DeltaNeutralPositionParams) => {
  await (async () => {
    const debouncedSell = createDebouncedSwap(jupiter, {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
    })

    let closedPositionSize = 0
    const subscriptionId = connection.onAccountChange(mangoAccount.publicKey, (accountInfo) => {
      const currentPositionSize = decodePositionSize({
        accountInfo,
        mangoAccount,
        mangoGroup,
        tokenIndex,
      })

      const amountToSell = basePositionSizeUi - currentPositionSize + closedPositionSize
      if (amountToSell === 0) {
        return
      }
      console.log(amountToSell)
      debouncedSell(toRaw(amountToSell, 9))

      closedPositionSize += amountToSell
      if (closedPositionSize === basePositionSizeUi) {
        connection.removeAccountChangeListener(subscriptionId)
      }
    })

    await wait(1000)
  })()

  await placePerpTrailingOrder({
    positionSizeUi: basePositionSizeUi,
    orderSide: 'buy',
    orderbookSideGetter: getOrderbookSide,
    mangoClient,
    mangoGroup,
    mangoAccount,
    perpMarket,
  })
}
