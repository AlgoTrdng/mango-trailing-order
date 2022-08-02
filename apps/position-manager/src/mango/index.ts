import {
  Config,
  IDS,
  MangoAccount,
  MangoClient,
  MangoGroup,
  PerpMarket,
  PerpOrder,
} from '@blockworks-foundation/mango-client'

import { connection, walletKeyPair } from '../config'
import { wait } from '../utils/wait'

export const initMango = async () => {
  const mangoConfig = new Config(IDS)
  const mangoGroupConfig = mangoConfig.getGroupWithName('mainnet.1')!
  const mangoClient = new MangoClient(connection, mangoGroupConfig.mangoProgramId)
  const mangoGroup = await mangoClient.getMangoGroup(mangoGroupConfig.publicKey)

  const mangoAccount = await (async () => {
    const mangoAccounts = await mangoClient.getMangoAccountsForOwner(
      mangoGroup,
      walletKeyPair.publicKey,
    )
    if (!mangoAccounts.length) {
      throw Error('Missing Mango Account')
    }
    return mangoAccounts[0]
  })()

  return {
    mangoGroupConfig,
    mangoClient,
    mangoGroup,
    mangoAccount,
  }
}

export type Order = [number, number]
export type OrderbookSide = 'asks' | 'bids'
export type GetOrderbookSide = (side: OrderbookSide) => Order[]

type PlacePerpTrailingOrderParams = {
  positionSizeUi: number
  orderSide: 'sell' | 'buy'
  orderbookSideGetter: GetOrderbookSide
  mangoClient: MangoClient
  mangoGroup: MangoGroup
  mangoAccount: MangoAccount
  perpMarket: PerpMarket
}

const OrderbookSides = {
  sell: 'asks',
  buy: 'bids',
} as const

// TODO: make this function reusable for sell, buy,...
/**
 * Place limit order that changes every time
 * a new order is placed in front of the current order
 */
export const placePerpTrailingOrder = async ({
  positionSizeUi,
  orderSide,
  orderbookSideGetter,
  mangoClient,
  mangoGroup,
  mangoAccount,
  perpMarket,
}: PlacePerpTrailingOrderParams) => {
  const orderId = new Date().getTime()
  const orderbookSide = OrderbookSides[orderSide]

  let price = (() => {
    const [highestOrder] = orderbookSideGetter(orderbookSide)
    return highestOrder[0]
  })()

  // Place initial order
  console.log(`Placing order at $ ${price}`)
  await mangoClient.placePerpOrder2(
    mangoGroup,
    mangoAccount,
    perpMarket,
    walletKeyPair,
    orderSide,
    price,
    positionSizeUi,
    { orderType: 'limit', clientOrderId: orderId },
  )

  const getOrder = async (orderPrice: number) => {
    const start = new Date().getTime()

    let orders: PerpOrder[] = []
    while (new Date().getTime() - 10000 < start) {
      orders = await perpMarket.loadOrdersForAccount(connection, mangoAccount)
      const order = orders.find(({ clientId }) => clientId?.toNumber() === orderId)

      if (!order || order.price !== orderPrice) {
        continue
      }

      return order
    }

    return null
  }

  const shouldChangeOrder = (orderPrice: number, highestOrderPrice: number) => {
    switch (orderbookSide) {
      case 'asks':
        return highestOrderPrice < orderPrice
      case 'bids':
        return highestOrderPrice > orderPrice
      default:
        // should never happen
        throw Error(`Invalid orderbook side: ${orderbookSide}`)
    }
  }

  // Trail market price
  while (true) {
    await wait(500)
    const order = await getOrder(price)

    if (!order) {
      console.log('Short position was fully opened')
      return
    }

    const [highestOrder] = orderbookSideGetter(orderbookSide)
    if (!shouldChangeOrder(price, highestOrder[0])) {
      continue
    }

    // eslint-disable-next-line prefer-destructuring
    price = highestOrder[0]
    console.log(`Changing order to $ ${price}`)

    // Change order
    try {
      await mangoClient.modifyPerpOrder(
        mangoGroup,
        mangoAccount,
        mangoGroup.mangoCache,
        perpMarket,
        walletKeyPair,
        order,
        orderSide,
        price,
        order.size,
        'limit',
        orderId,
      )
    } catch (error: Error | any) {
      // If transaction fails check if there are still any orders after 10 secs
      //   If yes, continue
      //   If not, position was fully opened
      if (error?.message === 'Transaction failed') {
        await wait(10_000)
        const orders = await perpMarket.loadOrdersForAccount(connection, mangoAccount)
        const currentOrder = orders.find(({ clientId }) => clientId?.toNumber() === orderId)

        if (!currentOrder) {
          console.log('Short position was fully opened')
          return
        }
      }
    }
  }
}
