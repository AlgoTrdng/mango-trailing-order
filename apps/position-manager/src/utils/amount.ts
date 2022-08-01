export const floor = (num: number, decimals: number) => {
  const tenExponent = 10 ** decimals
  return Math.floor(num * tenExponent) / tenExponent
}

export const toUi = (num: number, decimals: number) => (
  Math.floor(num / 10 ** decimals)
)

export const toRaw = (num: number, decimals: number) => (
  Math.floor(num * 10 ** decimals)
)
