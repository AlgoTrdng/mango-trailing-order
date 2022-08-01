import {
  BN,
  BookSide,
  BookSideLayout,
  getPerpMarketByBaseSymbol,
  MangoAccount,
  MangoAccountLayout,
  PerpOrder,
} from '@blockworks-foundation/mango-client'

import { connection, walletKeyPair } from './config'
import { SOL_MINT, USDC_MINT } from './constants'
import {
  initMango,
  Order,
  OrderbookSide,
  placePerpTrailingOrder,
} from './mango'
import { debounce } from './utils/debounce'
import { floor, toRaw, toUi } from './utils/amount'
import { wait } from './utils/wait'
import { executeJupiterSwap, initJupiter, SwapResult } from './jupiter'

const main = async () => {
  // ----------
  // Init mango
  const {
    mangoClient,
    mangoGroupConfig,
    mangoGroup,
    mangoAccount,
  } = await initMango()
  const perpMarketConfig = getPerpMarketByBaseSymbol(mangoGroupConfig, 'SOL')!

  const perpMarket = await mangoGroup.loadPerpMarket(
    connection,
    perpMarketConfig.marketIndex,
    perpMarketConfig.baseDecimals,
    perpMarketConfig.quoteDecimals,
  )

  // ---------------------
  // Subscribe to mango OB
  const getOrderbookSide = await (async () => {
    const orderbook = new Map<OrderbookSide, Order[]>()

    // Init
    const orderbookUnparsed = await Promise.all([
      perpMarket.loadAsks(connection),
      perpMarket.loadBids(connection),
    ])

    orderbookUnparsed.forEach((side, i) => {
      const key = i === 0 ? 'asks' : 'bids' as const
      orderbook.set(key, side.getL2Ui(5))
    })

    // Subscribe
    const sidesKeys = [
      ['asks', perpMarketConfig.asksKey],
      ['bids', perpMarketConfig.bidsKey],
    ] as const
    sidesKeys.forEach(([side, pk]) => {
      connection.onAccountChange(pk, (accountInfo) => {
        const parsed = new BookSide(pk, perpMarket, BookSideLayout.decode(accountInfo.data))
        orderbook.set(side, parsed.getL2Ui(5))
      })
    })
    await wait(10000)
    return (side: OrderbookSide) => orderbook.get(side)!
  })()

  const jupiter = await initJupiter()
  // -------------------
  // Check spread
  // If possible place limit sell order in front of the highest ask
  // otherwise place on the highest ask
  //
  // Subscribe to mango account
  // On SOL base position update buy the same amount on Jupiter
  // and deposit to mango

  const inputSolAmountUi = (() => {
    const [highestAsk] = getOrderbookSide('asks')
    return floor(50 / highestAsk[0], 2)
  })()

  const solTokenIndex = mangoGroup.tokens.findIndex(({ mint }) => mint.equals(SOL_MINT))
  const openShortDeltaNeutralPosition = async () => {
    const solPositionSizeUi = inputSolAmountUi

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

    await placePerpTrailingOrder({
      positionSizeUi: solPositionSizeUi,
      orderSide: 'sell',
      orderbookSideGetter: getOrderbookSide,
      mangoClient,
      mangoGroup,
      mangoAccount,
      perpMarket,
    })
  }

  // await openShortDeltaNeutralPosition()
}

main()
