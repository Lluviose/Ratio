import type { AccountGroupId } from './accounts'

export type ThemeId = 'matisse' | 'matisse2' | 'macke' | 'mondrian' | 'kandinsky' | 'miro'

export type ThemeColors = Record<AccountGroupId, string>

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '')
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0] + raw[0], 16)
    const g = Number.parseInt(raw[1] + raw[1], 16)
    const b = Number.parseInt(raw[2] + raw[2], 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  if (raw.length === 6) {
    const r = Number.parseInt(raw.slice(0, 2), 16)
    const g = Number.parseInt(raw.slice(2, 4), 16)
    const b = Number.parseInt(raw.slice(4, 6), 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  return null
}

export function isLightColor(color: string): boolean {
  const rgb = hexToRgb(color)
  if (!rgb) return true
  const srgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  )
  const [r, g, b] = srgb
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.62
}

export function pickForegroundColor(bg: string): string {
  return isLightColor(bg) ? 'rgba(11, 15, 26, 0.92)' : 'rgba(255,255,255,0.96)'
}

export type ThemeOption = {
  id: ThemeId
  name: string
  colors: ThemeColors
}

export const themeOptions: ThemeOption[] = [
  {
    id: 'matisse',
    name: 'Matisse',
    colors: {
      liquid: '#f59e0b',
      invest: '#ff8b73',
      fixed: '#26c6da',
      receivable: '#c7b5ff',
      debt: '#57534e',
    },
  },
  {
    id: 'matisse2',
    name: 'Matisse 2',
    colors: {
      liquid: '#10b981',
      invest: '#6366f1',
      fixed: '#a5b4fc',
      receivable: '#67e8f9',
      debt: '#475569',
    },
  },
  {
    id: 'macke',
    name: 'Macke',
    colors: {
      liquid: '#f5d18a',
      invest: '#ff6b57',
      fixed: '#3949c7',
      receivable: '#9ba9ff',
      debt: '#d9d4f6',
    },
  },
  {
    id: 'mondrian',
    name: 'Mondrian',
    colors: {
      liquid: '#eab308',
      invest: '#ef4444',
      fixed: '#2563eb',
      receivable: '#94a3b8',
      debt: '#171717',
    },
  },
  {
    id: 'kandinsky',
    name: 'Kandinsky',
    colors: {
      liquid: '#f97316',
      invest: '#ef4444',
      fixed: '#8b5cf6',
      receivable: '#3b82f6',
      debt: '#581c87',
    },
  },
  {
    id: 'miro',
    name: 'Miro',
    colors: {
      liquid: '#ffb703',
      invest: '#f43f5e',
      fixed: '#0ea5e9',
      receivable: '#14b8a6',
      debt: '#1f2937',
    },
  },
]
