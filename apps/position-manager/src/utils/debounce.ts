export const debounce = <T extends any[]>(
  cb: (...args: T) => void | Promise<void>,
  ms: number,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: T) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      cb(...args)
    }, ms)
  }
}
