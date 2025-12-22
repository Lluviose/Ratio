export function allocateIntegerPercents<T extends string>(
  items: Array<{ id: T; amount: number }>,
): Record<T, number> {
  const result = Object.fromEntries(items.map((i) => [i.id, 0])) as Record<T, number>

  const normalized = items.map((i) => ({
    id: i.id,
    amount: Number.isFinite(i.amount) ? Math.max(0, i.amount) : 0,
  }))
  const total = normalized.reduce((s, i) => s + i.amount, 0)
  if (total <= 0) return result

  const exact = normalized.map((i) => ({
    id: i.id,
    amount: i.amount,
    exact: (i.amount / total) * 100,
  }))

  const floors = exact.map((i) => ({
    ...i,
    floor: Math.floor(i.exact),
    remainder: i.exact - Math.floor(i.exact),
  }))

  for (const i of floors) {
    if (i.amount > 0 && i.floor === 0) i.floor = 1
  }

  let sum = floors.reduce((s, i) => s + i.floor, 0)

  if (sum > 100) {
    let overshoot = sum - 100
    const reducible = floors
      .slice()
      .sort((a, b) => b.floor - a.floor || b.remainder - a.remainder || b.amount - a.amount)

    for (const i of reducible) {
      if (overshoot <= 0) break
      const min = i.amount > 0 ? 1 : 0
      if (i.floor <= min) continue
      const dec = Math.min(overshoot, i.floor - min)
      i.floor -= dec
      overshoot -= dec
    }

    sum = reducible.reduce((s, i) => s + i.floor, 0)
    if (sum > 100) {
      const ids = reducible.map((i) => i.id)
      for (const id of ids) result[id] = 0
      return result
    }
  } else if (sum < 100) {
    let remaining = 100 - sum
    const order = floors
      .slice()
      .sort((a, b) => b.remainder - a.remainder || b.amount - a.amount)

    while (remaining > 0) {
      let progressed = false
      for (const i of order) {
        if (remaining <= 0) break
        if (i.amount <= 0) continue
        i.floor += 1
        remaining -= 1
        progressed = true
      }
      if (!progressed) break
    }
  }

  for (const i of floors) result[i.id] = i.amount > 0 ? i.floor : 0
  return result
}

