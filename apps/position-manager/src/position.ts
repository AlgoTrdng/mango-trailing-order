import { MangoAccountLayout, MangoAccount } from '@blockworks-foundation/mango-client'
import { Jupiter, SwapResult } from '@jup-ag/core'

import { connection } from './config'
import { USDC_MINT, SOL_MINT } from './constants'
import { executeJupiterSwap } from './jupiter'
import { toRaw, floor } from './utils/amount'
import { debounce } from './utils/debounce'
import { wait } from './utils/wait'

/**
 * Opens short delta neutral position
 *  - SOL-PERP Short
 *  - hedged with spot SOL/USDC
 */
export const openShortDeltaNeutralPosition = async (jupiter: Jupiter) => {
  // -------------------
  // Open hedge position
  await (async () => {
    const debouncedSwap = debounce(async (solOutputAmountUi: number) => {
      let result: SwapResult | null = null
      console.log(`Executing buy for ${solOutputAmountUi} SOL`)
      do {
        result = await executeJupiterSwap(jupiter, {
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          amountRaw: toRaw(solOutputAmountUi, 9),
          exactOut: true,
        })

        if (!result) {
          await wait(500)
        }
      } while (!result)
    }, 2000)

    let openedPositionSize = 0
    const subscriptionId = connection.onAccountChange(mangoAccount.publicKey, (accountInfo) => {
      const decoded = MangoAccountLayout.decode(accountInfo.data)
      const account = new MangoAccount(mangoAccount.publicKey, decoded)
      const currentPositionSize = Math.abs(
        account.getBasePositionUiWithGroup(solTokenIndex, mangoGroup),
      )

      if (currentPositionSize === openedPositionSize) {
        return
      }

      const solAmountToBuy = currentPositionSize - openedPositionSize
      debouncedSwap(solAmountToBuy)

      openedPositionSize = currentPositionSize
      // Actual position size can vary by small amount
      console.log(floor(openedPositionSize, 2), solPositionSizeUi)
      if (floor(openedPositionSize, 2) === solPositionSizeUi) {
        connection.removeAccountChangeListener(subscriptionId)
        console.log(`Successfully opened delta-neutral position with size: ${openedPositionSize}`)
      }
    })

    await wait(1000)
  })()
}
