import {
  FillEvent,
  PerpEventQueue,
  PerpEventQueueLayout,
} from '@blockworks-foundation/mango-client'
import { AccountInfo } from '@solana/web3.js'

type MangoEvent = {
  fill?: FillEvent
}

type MangoPerpEventQueue = {
  events: MangoEvent[]
}

export const parsePerpEventQueue = (accountInfo: AccountInfo<Buffer>) => {
  const decoded = PerpEventQueueLayout.decode(accountInfo.data)
  return new PerpEventQueue(decoded) as MangoPerpEventQueue
}
