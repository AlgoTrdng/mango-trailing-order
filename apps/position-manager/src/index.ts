import {
  BookSide,
  BookSideLayout,
  getPerpMarketByBaseSymbol,
} from '@blockworks-foundation/mango-client'

import { connection } from './config'
import { SOL_MINT } from './constants'
import {
  initMango,
  Order,
  OrderbookSide,
} from './mango'
import { floor } from './utils/amount'
import { wait } from './utils/wait'
import { initJupiter } from './jupiter'
import { closeShortDeltaNeutralPosition, openShortDeltaNeutralPosition } from './position'

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

  const inputSolAmountUi = (() => {
    const [highestAsk] = getOrderbookSide('asks')
    return floor(200 / highestAsk[0], 2)
  })()

  console.log(`Opening delta neutral position with size ${inputSolAmountUi} SOL`)

  const solTokenIndex = mangoGroup.tokens.findIndex(({ mint }) => mint.equals(SOL_MINT))
  const positionSize = await openShortDeltaNeutralPosition({
    jupiter,
    mangoAccount,
    mangoClient,
    mangoGroup,
    perpMarket,
    getOrderbookSide,
    basePositionSizeUi: inputSolAmountUi,
    tokenIndex: solTokenIndex,
  })

  console.log(`Successfuly opened short position with size ${positionSize} SOL`)

  await wait(5000)

  await closeShortDeltaNeutralPosition({
    basePositionSizeUi: positionSize,
    tokenIndex: solTokenIndex,
    jupiter,
    mangoAccount,
    mangoClient,
    mangoGroup,
    perpMarket,
    getOrderbookSide,
  })
  console.log(`Successfuly closed short position with size ${positionSize} SOL`)
}

main()
