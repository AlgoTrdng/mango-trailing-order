import { Connection, Keypair } from '@solana/web3.js'
// eslint-disable-next-line import/no-extraneous-dependencies
import dotenv from 'dotenv'

dotenv.config()

export const env = (() => {
  const ENV_VARIABLES = ['SOL_PRIVATE_KEY'] as const

  const missing: string[] = []
  ENV_VARIABLES.forEach((key) => {
    if (!(key in process.env)) {
      missing.push(key)
    }
  })

  if (missing.length) {
    throw Error(`Missing ENV variables: ${missing.join(', ')}`)
  }

  return process.env as typeof process.env & { [K in typeof ENV_VARIABLES[number]]: string }
})()

const SOL_RPC_ENDPOINT = 'https://ssc-dao.genesysgo.net/'
export const connection = new Connection(SOL_RPC_ENDPOINT, 'confirmed')
export const walletKeyPair = Keypair.fromSecretKey(
  new Uint8Array(env.SOL_PRIVATE_KEY.split(',').map((x) => Number(x))),
)
