import { addMoney, normalizeMoney, subtractMoney } from './money'

export type MoneyExpressionOperator = '+' | '-'

export type MoneyExpressionResult =
  | { ok: true; value: number; hasOperator: boolean }
  | { ok: false; reason: 'empty' | 'incomplete' | 'invalid'; hasOperator: boolean }

const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/

export function sanitizeMoneyExpressionInput(value: string): string {
  let next = ''
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      next += ch
      continue
    }
    if (ch === '.') {
      next += ch
      continue
    }
    if (ch === '+' || ch === '＋') {
      next += '+'
      continue
    }
    if (ch === '-' || ch === '－' || ch === '−') {
      next += '-'
    }
  }
  return next
}

export function appendMoneyExpressionOperator(value: string, operator: MoneyExpressionOperator): string {
  const compact = sanitizeMoneyExpressionInput(value).replace(/\s+/g, '')
  if (!compact) return ''

  let base = compact.replace(/[+-]+$/g, '')
  if (/\d\.$/.test(base)) base = base.slice(0, -1)
  if (!NUMBER_PATTERN.test(lastMoneyExpressionToken(base))) return compact

  return `${base}${operator}`
}

export function evaluateMoneyExpression(value: string): MoneyExpressionResult {
  const input = sanitizeMoneyExpressionInput(value).replace(/\s+/g, '')
  const hasOperator = /[+-]/.test(input)

  if (!input) return { ok: false, reason: 'empty', hasOperator }
  if (/[+-]$/.test(input)) return { ok: false, reason: 'incomplete', hasOperator }

  const tokens = input.match(/[+-]?[^+-]+/g)
  if (!tokens || tokens.join('') !== input) return { ok: false, reason: 'invalid', hasOperator }

  let total = 0
  for (const token of tokens) {
    const sign = token[0] === '-' ? -1 : 1
    const rawAmount = token[0] === '-' || token[0] === '+' ? token.slice(1) : token
    if (!NUMBER_PATTERN.test(rawAmount)) return { ok: false, reason: 'invalid', hasOperator }

    const amount = normalizeMoney(Number(rawAmount))
    total = sign < 0 ? subtractMoney(total, amount) : addMoney(total, amount)
  }

  return { ok: true, value: normalizeMoney(total), hasOperator }
}

function lastMoneyExpressionToken(value: string) {
  const match = value.match(/[^+-]+$/)
  return match?.[0] ?? ''
}
