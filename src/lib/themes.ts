export type ThemeId = 'matisse' | 'matisse2' | 'macke' | 'mondrian' | 'kandinsky' | 'miro'

export type ThemeOption = {
  id: ThemeId
  name: string
  swatches: [string, string, string]
}

export const themeOptions: ThemeOption[] = [
  { id: 'matisse', name: 'Matisse', swatches: ['#c7b5ff', '#ff8b73', '#26c6da'] },
  { id: 'matisse2', name: 'Matisse 2', swatches: ['#a4b5ff', '#5865ff', '#47d16a'] },
  { id: 'macke', name: 'Macke', swatches: ['#ffd08a', '#ff6b57', '#2f6cff'] },
  { id: 'mondrian', name: 'Mondrian', swatches: ['#ffb703', '#1d4ed8', '#ffffff'] },
  { id: 'kandinsky', name: 'Kandinsky', swatches: ['#8b5cf6', '#f59e0b', '#ef4444'] },
  { id: 'miro', name: 'Miro', swatches: ['#1d4ed8', '#14b8a6', '#fbbf24'] },
]
