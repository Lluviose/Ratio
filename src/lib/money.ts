const MONEY_SCALE = 100

function toScaledInteger(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  const scaled = Math.round((abs + Number.EPSILON) * MONEY_SCALE)
  return scaled === 0 ? 0 : sign * scaled
}

function fromScaledInteger(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  if (rounded === 0) return 0
  return rounded / MONEY_SCALE
}

export function normalizeMoney(value: number): number {
  return fromScaledInteger(toScaledInteger(value))
}

export function addMoney(left: number, right: number): number {
  return fromScaledInteger(toScaledInteger(left) + toScaledInteger(right))
}

export function subtractMoney(left: number, right: number): number {
  return fromScaledInteger(toScaledInteger(left) - toScaledInteger(right))
}

export function moneyEquals(left: number, right: number): boolean {
  return toScaledInteger(left) === toScaledInteger(right)
}
