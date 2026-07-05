// 金额字符串 → 滚动数位 token。键从右往左编号：
// 位数变化时尾部数位与千分位逗号保持身份，滚动发生在正确的位上，
// 新增/移除的高位由 AnimatedAmount 的 AnimatePresence 处理进出场。
export type AmountToken =
  | { key: string; kind: 'digit'; digit: number }
  | { key: string; kind: 'symbol'; char: string }

export function splitAmountTokens(formatted: string): AmountToken[] {
  const chars = Array.from(formatted)
  const total = chars.length
  return chars.map((char, i) => {
    const fromRight = total - 1 - i
    if (char >= '0' && char <= '9') {
      return { key: `d${fromRight}`, kind: 'digit', digit: char.charCodeAt(0) - 48 }
    }
    return { key: `s${fromRight}-${char}`, kind: 'symbol', char }
  })
}
