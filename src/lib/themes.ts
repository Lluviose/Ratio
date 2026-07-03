import type { AccountGroupId } from './accounts'

export type ThemeId = 'random' | 'matisse' | 'matisse2' | 'macke' | 'mondrian' | 'kandinsky' | 'miro'

export type RealThemeId = Exclude<ThemeId, 'random'>

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

export const realThemeOptions: ThemeOption[] = [
  {
    id: 'matisse',
    name: 'Matisse',
    // 野兽派剪纸：柠檬黄 / 韦罗内塞绿 / 钴蓝 / 灰玫瑰 / 纸灰
    colors: {
      liquid: '#f7cd57',
      invest: '#17976d',
      fixed: '#2f63d3',
      receivable: '#e57f88',
      debt: '#d7d2c6',
    },
  },
  {
    id: 'matisse2',
    name: 'Matisse 2',
    // 《爵士》夜色：祖母绿 / 靛蓝 / 深海军 / 青瓷蓝 / 雾靛灰
    colors: {
      liquid: '#17a673',
      invest: '#5a5fd8',
      fixed: '#2c3e8f',
      receivable: '#3fc3dd',
      debt: '#d5daf0',
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
    // 新造型主义：镉黄 / 深胭脂红 / 群青 / 画廊灰 / 格线黑
    colors: {
      liquid: '#f7cf52',
      invest: '#c53225',
      fixed: '#2a56c5',
      receivable: '#d8d5cb',
      debt: '#17181c',
    },
  },
  {
    id: 'kandinsky',
    name: 'Kandinsky',
    // 《构成八号》：橙 / 紫红 / 石油蓝 / 玫瑰粉 / 淡丁香灰
    colors: {
      liquid: '#f0982e',
      invest: '#a827cf',
      fixed: '#1a7fa8',
      receivable: '#e88bb1',
      debt: '#ddd6e8',
    },
  },
  {
    id: 'miro',
    name: 'Miro',
    // 米罗星群：明黄 / 天青 / 朱红 / 草绿 / 墨黑
    colors: {
      liquid: '#f8d05e',
      invest: '#17a3cf',
      fixed: '#e0432f',
      receivable: '#3aa864',
      debt: '#22242a',
    },
  },
]

export const REAL_THEME_IDS: RealThemeId[] = [
  'matisse',
  'matisse2',
  'macke',
  'mondrian',
  'kandinsky',
  'miro',
]

export function pickRandomThemeId(): RealThemeId {
  const idx = Math.floor(Math.random() * REAL_THEME_IDS.length)
  return REAL_THEME_IDS[idx] ?? REAL_THEME_IDS[0]
}

export const themeOptions: ThemeOption[] = [
  {
    id: 'random',
    name: 'Random',
    colors: realThemeOptions[0]?.colors ?? {
      liquid: '#f7cd57',
      invest: '#17976d',
      fixed: '#2f63d3',
      receivable: '#e57f88',
      debt: '#d7d2c6',
    },
  },
  ...realThemeOptions,
]
